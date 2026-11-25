// backend/src/utils/safeAuditLog.js
// Best-effort audit logging for background jobs. A failed audit write must never
// fail a data import (e.g. scheduled syncs run as a system user with no User row,
// which violates the audit_logs.userId foreign key).

import prisma from '../config/database.js';
import logger from './logger.js';

export async function safeAuditLog(data) {
  try {
    await prisma.auditLog.create({ data });
  } catch (err) {
    if (data?.userId) {
      try {
        await prisma.auditLog.create({ data: { ...data, userId: null } });
        return;
      } catch (retryErr) {
        logger.warn(`Audit log write failed (${data.action}): ${retryErr.message}`);
        return;
      }
    }
    logger.warn(`Audit log write failed (${data?.action}): ${err.message}`);
  }
}

export default safeAuditLog;
