// backend/src/config/database.js
// Prisma Client singleton.

import { PrismaClient } from '@prisma/client';
import { env } from './environment.js';

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.LOG_SQL ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { prisma };
export default prisma;
