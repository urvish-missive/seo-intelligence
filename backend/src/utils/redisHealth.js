// backend/src/utils/redisHealth.js
// Utility for querying Redis connection health, latency, and queue readiness.

import { checkRedisHealth, isRedisAvailable } from '../config/redis.js';

export async function getRedisHealthSummary() {
  const health = await checkRedisHealth();
  return {
    isAvailable: isRedisAvailable(),
    ...health,
    timestamp: new Date().toISOString(),
  };
}

export default getRedisHealthSummary;
