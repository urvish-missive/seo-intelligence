// backend/src/app.js
// Express application factory.

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/environment.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';

// Route modules
import healthRoutes from './modules/health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import workspaceRoutes from './modules/workspaces/workspace.routes.js';
import memberRoutes from './modules/members/member.routes.js';
import roleRoutes from './modules/roles/role.routes.js';
import clientRoutes from './modules/clients/client.routes.js';
import websiteRoutes from './modules/websites/website.routes.js';
import integrationRoutes from './modules/integrations/integrations.routes.js';
import clarityRoutes from './modules/integrations/clarity/clarity.routes.js';
import bingRoutes from './modules/integrations/bing/bing.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import syncRoutes from './modules/sync/sync.routes.js';
import seoAnalysisRoutes from './modules/seo-analysis/routes/seo-analysis.routes.js';
import aiRoutes from './modules/ai/routes/ai.routes.js';
import reportRoutes from './modules/reports/routes/report.routes.js';
import mcpStreamableRouter from './mcp/transports/streamable-http.transport.js';
import mcpAdminRoutes from './mcp/routes/mcp-admin.routes.js';

export function createApp() {
  const app = express();

  // ─── Security headers ───────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    })
  );

  // ─── CORS ───────────────────────────────────────────────────────────
  const allowedOrigins = env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',').map((s) => s.trim())
    : [env.FRONTEND_URL];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
          return callback(null, true);
        }
        return callback(new Error(`CORS blocked: Origin ${origin} not permitted.`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // ─── Body parsing ───────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser(env.COOKIE_SECRET));

  // ─── Request logging ────────────────────────────────────────────────
  if (env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  // ─── Rate limiting ──────────────────────────────────────────────────
  app.use('/api', apiLimiter);

  // ─── API Routes (v1) ─────────────────────────────────────────────────
  app.use('/api/v1', healthRoutes);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/workspaces', workspaceRoutes);
  app.use('/api/v1', memberRoutes);
  app.use('/api/v1', roleRoutes);
  app.use('/api/v1', clientRoutes);
  app.use('/api/v1', websiteRoutes);
  app.use('/api/v1', integrationRoutes);
  app.use('/api/v1', clarityRoutes);
  app.use('/api/v1', bingRoutes);
  app.use('/api/v1', analyticsRoutes);
  app.use('/api/v1', syncRoutes);
  app.use('/api/v1', seoAnalysisRoutes);
  app.use('/api/v1', aiRoutes);
  app.use('/api/v1/workspaces/:workspaceId/reports', reportRoutes);
  app.use('/api/v1/mcp', mcpStreamableRouter);
  app.use('/api/v1', mcpAdminRoutes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: `Route ${req.method} ${req.path} not found`,
    });
  });

  // ─── Error handler (must be last) ───────────────────────────────────
  app.use(errorHandler);

  return app;
}

export default createApp;
