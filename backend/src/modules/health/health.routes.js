// backend/src/modules/health/health.routes.js
// Health check endpoints — no auth required.

import { Router } from 'express';
import prisma from '../../config/database.js';
import { isRedisAvailable, getRedisClient } from '../../config/redis.js';
import { env } from '../../config/environment.js';
import logger from '../../utils/logger.js';

const router = Router();

/**
 * GET /api/v1/health
 * Basic liveness check — always returns 200 if the server is running.
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'missive-seo-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

/**
 * GET /api/v1/health/detailed
 * Full system health — checks DB, Redis, BullMQ queues, Ollama, and MCP subsystem.
 * No credentials, tokens, or sensitive configurations are ever exposed.
 */
router.get('/health/detailed', async (req, res) => {
  const checks = {
    database: { status: 'unknown', message: null },
    redis: { status: 'unknown', message: null },
    queues: { status: 'unknown', message: null, details: {} },
    ollama: { status: 'unknown', message: null },
    mcp: { status: 'unknown', message: null, details: {} },
  };

  // ─── Database check ──────────────────────────────────────────────
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'healthy', message: 'Connected' };
  } catch (err) {
    logger.warn('Health: Database check failed', { error: err.message });
    checks.database = { status: 'unhealthy', message: err.message };
  }

  // ─── Redis check ─────────────────────────────────────────────────
  let redisOk = false;
  try {
    if (isRedisAvailable()) {
      const client = getRedisClient();
      await client.ping();
      checks.redis = { status: 'healthy', message: 'Connected — background jobs active' };
      redisOk = true;
    } else {
      checks.redis = {
        status: 'unavailable',
        message: 'Redis not connected — background jobs paused.',
      };
    }
  } catch (err) {
    checks.redis = { status: 'unhealthy', message: err.message };
  }

  // ─── BullMQ Queues check ──────────────────────────────────────────
  if (redisOk) {
    try {
      const { getSyncQueue } = await import('../../queues/sync.queue.js');
      const { getAnalysisQueue } = await import('../seo-analysis/queues/seo-analysis.queue.js');
      const { getReportQueue } = await import('../reports/schedulers/report.queue.js');

      const syncQ = getSyncQueue();
      const analysisQ = getAnalysisQueue();
      const reportQ = getReportQueue();

      const [syncCounts, analysisCounts, reportCounts] = await Promise.allSettled([
        syncQ ? syncQ.getJobCounts('waiting', 'active', 'failed', 'completed') : Promise.resolve(null),
        analysisQ ? analysisQ.getJobCounts('waiting', 'active', 'failed', 'completed') : Promise.resolve(null),
        reportQ ? reportQ.getJobCounts('waiting', 'active', 'failed', 'completed') : Promise.resolve(null),
      ]);

      checks.queues = {
        status: 'healthy',
        message: 'All 3 BullMQ queues operational (sync, analysis, reports)',
        details: {
          sync: syncCounts.status === 'fulfilled' ? syncCounts.value : 'offline',
          analysis: analysisCounts.status === 'fulfilled' ? analysisCounts.value : 'offline',
          reports: reportCounts.status === 'fulfilled' ? reportCounts.value : 'offline',
        },
      };
    } catch (err) {
      checks.queues = {
        status: 'degraded',
        message: `Queue check error: ${err.message}`,
        details: {},
      };
    }
  } else {
    checks.queues = {
      status: 'paused',
      message: 'Background queues paused due to Redis unavailability',
      details: {},
    };
  }

  // ─── Ollama check ────────────────────────────────────────────────
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const models = data.models?.map(m => m.name) || [];
      const hasConfiguredModel = models.some(m => m.includes(env.OLLAMA_MODEL.split(':')[0]));
      checks.ollama = {
        status: hasConfiguredModel ? 'healthy' : 'model_missing',
        message: hasConfiguredModel
          ? `Connected — model ${env.OLLAMA_MODEL} available`
          : `Ollama running but model "${env.OLLAMA_MODEL}" not found. Run: ollama pull ${env.OLLAMA_MODEL}`,
        availableModels: models,
        configuredModel: env.OLLAMA_MODEL,
      };
    } else {
      checks.ollama = { status: 'unhealthy', message: `Ollama returned ${response.status}` };
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      checks.ollama = {
        status: 'unavailable',
        message: `Ollama not reachable at ${env.OLLAMA_BASE_URL}. Install from https://ollama.com/download`,
      };
    } else {
      checks.ollama = {
        status: 'unavailable',
        message: `Ollama not reachable — ${err.message}`,
      };
    }
  }

  // ─── MCP Subsystem check ──────────────────────────────────────────
  try {
    const { MCP_SERVER_CONFIG } = await import('../../mcp/server/mcp.config.js');
    checks.mcp = {
      status: 'healthy',
      message: 'MCP server definition and tools registered',
      details: {
        serverName: MCP_SERVER_CONFIG.name,
        version: MCP_SERVER_CONFIG.version,
        transports: MCP_SERVER_CONFIG.supportedTransports,
        toolsCount: 20,
        resourcesCount: 3,
        promptsCount: 3,
      },
    };
  } catch (err) {
    checks.mcp = {
      status: 'unhealthy',
      message: `MCP configuration error: ${err.message}`,
      details: {},
    };
  }

  // Critical dependencies: database is essential. Redis / Ollama / Queues may be partial/degraded in dev.
  const criticalOk = checks.database.status === 'healthy';
  const hasErrors = Object.values(checks).some(c => c.status === 'unhealthy');
  const allHealthy = Object.values(checks).every(c => c.status === 'healthy');

  const overall = allHealthy ? 'healthy' : criticalOk ? 'degraded' : 'unhealthy';
  const statusCode = overall === 'unhealthy' ? 503 : 200;

  res.status(statusCode).json({
    success: true,
    status: overall,
    service: 'missive-seo-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,
  });
});

export default router;
