// backend/src/services/sync/syncLock.service.js
// Distributed lock service preventing concurrent duplicate sync jobs for the same website and provider.
// Uses Redis SET NX with TTL, falling back safely to MySQL status check if Redis is unavailable.

import { getRedisClient, isRedisAvailable } from '../../config/redis.js';
import prisma from '../../config/database.js';
import logger from '../../utils/logger.js';

const DEFAULT_LOCK_TTL_SECONDS = 300; // 5 minutes max lock duration

export class SyncLockService {
  /**
   * Attempt to acquire an exclusive lock for a website and provider.
   *
   * @param {string} websiteId
   * @param {string} provider - 'GA4', 'GSC', 'CLARITY'
   * @param {number} ttlSeconds
   * @returns {Promise<{ acquired: boolean, lockKey: string, lockId: string }>}
   */
  async acquireLock(websiteId, provider, ttlSeconds = DEFAULT_LOCK_TTL_SECONDS) {
    const lockKey = `lock:sync:${websiteId}:${provider.toUpperCase()}`;
    const lockId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // 1. Try Redis lock first if available
    if (isRedisAvailable()) {
      try {
        const client = getRedisClient();
        const result = await client.set(lockKey, lockId, 'NX', 'EX', ttlSeconds);
        if (result === 'OK') {
          return { acquired: true, lockKey, lockId, source: 'redis' };
        }
        return { acquired: false, lockKey, lockId: null, source: 'redis' };
      } catch (redisErr) {
        logger.warn(`Redis lock failed, falling back to database check: ${redisErr.message}`);
      }
    }

    // 2. Fallback: Database-level lock check on active IntegrationConnection
    const connection = await prisma.integrationConnection.findFirst({
      where: {
        websiteId,
        integrationType: provider.toUpperCase(),
      },
    });

    if (connection?.status === 'SYNCING') {
      // Check if lock has expired (older than 10 minutes)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      if (connection.updatedAt && connection.updatedAt > tenMinutesAgo) {
        return { acquired: false, lockKey, lockId: null, source: 'database' };
      }
    }

    // Mark connection as SYNCING
    if (connection) {
      await prisma.integrationConnection.update({
        where: { id: connection.id },
        data: { status: 'SYNCING' },
      });
    }

    return { acquired: true, lockKey, lockId, source: 'database' };
  }

  /**
   * Release the exclusive lock.
   */
  async releaseLock(websiteId, provider, lockId) {
    const lockKey = `lock:sync:${websiteId}:${provider.toUpperCase()}`;

    // 1. Release Redis lock
    if (isRedisAvailable()) {
      try {
        const client = getRedisClient();
        if (lockId) {
          // Lua script to release only if lockId matches
          const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
              return redis.call("del", KEYS[1])
            else
              return 0
            end
          `;
          await client.eval(script, 1, lockKey, lockId);
        } else {
          await client.del(lockKey);
        }
      } catch (redisErr) {
        logger.warn(`Failed to release Redis lock: ${redisErr.message}`);
      }
    }

    // 2. Update database connection status if still marked SYNCING
    const connection = await prisma.integrationConnection.findFirst({
      where: {
        websiteId,
        integrationType: provider.toUpperCase(),
      },
    });

    if (connection && connection.status === 'SYNCING') {
      await prisma.integrationConnection.update({
        where: { id: connection.id },
        data: { status: 'CONNECTED' },
      });
    }
  }
}

export const syncLockService = new SyncLockService();
export default syncLockService;
