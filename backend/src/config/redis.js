// backend/src/config/redis.js
// Enterprise ioredis connection manager for BullMQ and background caching.
// Designed to fail gracefully when Redis is unavailable without crashing Express.

import Redis from 'ioredis';
import { env } from './environment.js';
import logger from '../utils/logger.js';

let redisClient = null;
let redisAvailable = false;
let connectionAttempts = 0;

/**
 * Builds Redis connection options supporting direct parameters or full REDIS_URL.
 */
export function getRedisConnectionOptions() {
  if (env.REDIS_URL) {
    return {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
      ...(env.REDIS_TLS ? { tls: { rejectUnauthorized: false } } : {}),
      retryStrategy(times) {
        if (times > 10) {
          logger.warn('Redis: Maximum reconnection attempts reached. Background workers paused.');
          return null;
        }
        return Math.min(times * 500, 5000);
      },
    };
  }

  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    ...(env.REDIS_USERNAME ? { username: env.REDIS_USERNAME } : {}),
    ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
    ...(env.REDIS_TLS ? { tls: { rejectUnauthorized: false } } : {}),
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      if (times > 10) {
        logger.warn('Redis: Maximum reconnection attempts reached. Background workers paused.');
        return null;
      }
      return Math.min(times * 500, 5000);
    },
  };
}

/**
 * Initializes or returns the shared singleton Redis client.
 */
export function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  const options = getRedisConnectionOptions();

  try {
    if (env.REDIS_URL) {
      redisClient = new Redis(env.REDIS_URL, options);
    } else {
      redisClient = new Redis(options);
    }

    redisClient.on('connect', () => {
      logger.info('Redis: Connection established successfully');
      redisAvailable = true;
      connectionAttempts = 0;
    });

    redisClient.on('ready', () => {
      logger.info('Redis: Client ready for commands and BullMQ queue processing');
      redisAvailable = true;
    });

    redisClient.on('error', (err) => {
      connectionAttempts++;
      if (connectionAttempts <= 3 || connectionAttempts % 10 === 0) {
        logger.warn(`Redis: Connection warning — ${err.message}. Background jobs will be deferred.`);
      }
      redisAvailable = false;
    });

    redisClient.on('close', () => {
      if (redisAvailable) {
        logger.warn('Redis: Connection closed. Background queue paused.');
      }
      redisAvailable = false;
    });

    redisClient.on('end', () => {
      redisAvailable = false;
    });
  } catch (err) {
    logger.warn(`Redis initialization error: ${err.message}`);
    redisAvailable = false;
  }

  return redisClient;
}

/**
 * Checks if Redis is currently connected and responsive.
 */
export function isRedisAvailable() {
  return redisAvailable && redisClient?.status === 'ready';
}

/**
 * Perform a live ping health check on Redis.
 */
export async function checkRedisHealth() {
  const client = getRedisClient();
  if (!client || client.status !== 'ready') {
    return {
      status: 'unavailable',
      connected: false,
      latencyMs: null,
      message: 'Redis is disconnected or unreachable. Background jobs deferred.',
    };
  }

  const start = Date.now();
  try {
    const pong = await client.ping();
    const latencyMs = Date.now() - start;
    return {
      status: pong === 'PONG' ? 'healthy' : 'degraded',
      connected: true,
      latencyMs,
      message: 'Redis operational',
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      connected: false,
      latencyMs: null,
      message: err.message,
    };
  }
}

/**
 * Graceful shutdown for Redis connections.
 */
export async function closeRedisClient() {
  if (redisClient) {
    try {
      logger.info('Closing Redis client gracefully…');
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    } finally {
      redisClient = null;
      redisAvailable = false;
    }
  }
}

export default getRedisClient;
