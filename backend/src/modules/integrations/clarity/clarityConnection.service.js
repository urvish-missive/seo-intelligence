// backend/src/modules/integrations/clarity/clarityConnection.service.js
// Service for Microsoft Clarity connection lifecycle, token validation, AES-256-GCM encryption, and daily quota tracking.

import prisma from '../../../config/database.js';
import { clarityClientService } from './clarityClient.service.js';
import { encrypt, decrypt } from '../../../utils/encryption.js';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
  AppError,
} from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';

const DAILY_QUOTA_LIMIT = 10;

/**
 * Returns the start of the current UTC day.
 */
function getStartOfUtcDay() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Calls used today, treating a counter last reset before today (UTC) as 0.
 * The stored counter is only reset on the next call, so every reader must use this.
 */
export function getEffectiveCallsToday(connection) {
  if (!connection) return 0;
  if (!connection.apiCallsResetAt || new Date(connection.apiCallsResetAt) < getStartOfUtcDay()) {
    return 0;
  }
  return connection.apiCallsToday || 0;
}

export const CLARITY_DAILY_QUOTA_LIMIT = DAILY_QUOTA_LIMIT;

export class ClarityConnectionService {
  /**
   * Validate token against Microsoft Clarity API, encrypt credentials, and save connection in workspace.
   */
  async createConnection({ workspaceId, projectId, projectName, apiToken, user }) {
    if (!projectId || !apiToken) {
      throw new BadRequestError('Both Clarity Project ID and API Token are required.');
    }

    // 1. Verify workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundError('Target workspace not found.');
    }

    // 2. Validate token against official Microsoft Clarity API
    logger.info(`Testing Clarity API token for project ${projectId} in workspace ${workspaceId}`);
    let validationResult;
    try {
      validationResult = await clarityClientService.testToken(apiToken);
    } catch (testErr) {
      logger.error(`Clarity token validation failed for project ${projectId}: ${testErr.message}`);
      throw new BadRequestError(`Microsoft Clarity token validation failed: ${testErr.message}`);
    }

    // 3. Encrypt API token at rest using AES-256-GCM
    const apiTokenEnc = encrypt(apiToken.trim());

    // The validation call counts against the daily quota; respect UTC day rollover
    const existing = await prisma.clarityConnection.findUnique({
      where: { workspaceId_projectId: { workspaceId, projectId: projectId.trim() } },
      select: { apiCallsToday: true, apiCallsResetAt: true },
    });
    const callsAfterValidation = getEffectiveCallsToday(existing) + 1;

    // 4. Upsert connection in database
    const connection = await prisma.clarityConnection.upsert({
      where: {
        workspaceId_projectId: {
          workspaceId,
          projectId: projectId.trim(),
        },
      },
      update: {
        projectName: projectName ? projectName.trim() : `Clarity (${projectId.trim()})`,
        apiTokenEnc,
        status: 'CONNECTED',
        lastValidatedAt: new Date(),
        lastError: null,
        apiCallsToday: callsAfterValidation,
        apiCallsResetAt: getStartOfUtcDay(),
      },
      create: {
        workspaceId,
        projectId: projectId.trim(),
        projectName: projectName ? projectName.trim() : `Clarity (${projectId.trim()})`,
        apiTokenEnc,
        status: 'CONNECTED',
        createdById: user.id,
        lastValidatedAt: new Date(),
        apiCallsToday: 1,
        apiCallsResetAt: getStartOfUtcDay(),
      },
    });

    // 5. Audit Log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'integration.clarity_connected',
        entityType: 'ClarityConnection',
        entityId: connection.id,
        metadata: {
          projectId: connection.projectId,
          projectName: connection.projectName,
        },
      },
    });

    logger.info(
      `Clarity project ${connection.projectId} connected to workspace ${workspaceId} by user ${user.id}`
    );

    return {
      id: connection.id,
      workspaceId: connection.workspaceId,
      projectId: connection.projectId,
      projectName: connection.projectName,
      status: connection.status,
      lastValidatedAt: connection.lastValidatedAt,
      apiCallsToday: connection.apiCallsToday,
      createdAt: connection.createdAt,
      validationSample: validationResult.sampleData,
    };
  }

  /**
   * List all connected Microsoft Clarity projects in a workspace (safe metadata only).
   */
  async listConnections(workspaceId) {
    const connections = await prisma.clarityConnection.findMany({
      where: { workspaceId },
      select: {
        id: true,
        workspaceId: true,
        projectId: true,
        projectName: true,
        status: true,
        lastValidatedAt: true,
        lastSyncAt: true,
        lastError: true,
        apiCallsToday: true,
        apiCallsResetAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            integrations: true,
            snapshots: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return connections.map((conn) => ({
      ...conn,
      apiCallsToday: getEffectiveCallsToday(conn),
      connectedWebsitesCount: conn._count.integrations,
      snapshotsCount: conn._count.snapshots,
      _count: undefined,
    }));
  }

  /**
   * Get a single Clarity connection by ID with safe metadata.
   */
  async getConnectionById(workspaceId, connectionId) {
    const connection = await prisma.clarityConnection.findFirst({
      where: { id: connectionId, workspaceId },
      include: {
        integrations: {
          include: {
            website: {
              select: { id: true, domain: true, name: true },
            },
          },
        },
        _count: {
          select: { snapshots: true },
        },
      },
    });

    if (!connection) {
      throw new NotFoundError('Clarity connection not found in this workspace.');
    }

    return {
      id: connection.id,
      workspaceId: connection.workspaceId,
      projectId: connection.projectId,
      projectName: connection.projectName,
      status: connection.status,
      lastValidatedAt: connection.lastValidatedAt,
      lastSyncAt: connection.lastSyncAt,
      lastError: connection.lastError,
      apiCallsToday: getEffectiveCallsToday(connection),
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
      mappedWebsites: connection.integrations.map((i) => i.website),
      snapshotsCount: connection._count.snapshots,
    };
  }

  /**
   * Replace the API token for an existing Clarity connection.
   */
  async replaceToken({ workspaceId, connectionId, apiToken, projectName, user }) {
    const connection = await prisma.clarityConnection.findFirst({
      where: { id: connectionId, workspaceId },
    });

    if (!connection) {
      throw new NotFoundError('Clarity connection not found in this workspace.');
    }

    if (!apiToken) {
      throw new BadRequestError('New API token is required.');
    }

    // Validate new token with Microsoft
    await clarityClientService.testToken(apiToken);

    // Encrypt new token
    const apiTokenEnc = encrypt(apiToken.trim());

    const updated = await prisma.clarityConnection.update({
      where: { id: connectionId },
      data: {
        apiTokenEnc,
        projectName: projectName ? projectName.trim() : connection.projectName,
        status: 'CONNECTED',
        lastValidatedAt: new Date(),
        lastError: null,
      },
    });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'integration.clarity_token_replaced',
        entityType: 'ClarityConnection',
        entityId: connection.id,
        metadata: { projectId: connection.projectId },
      },
    });

    logger.info(`API token replaced for Clarity project ${connection.projectId} in workspace ${workspaceId}`);

    return {
      id: updated.id,
      projectId: updated.projectId,
      projectName: updated.projectName,
      status: updated.status,
      lastValidatedAt: updated.lastValidatedAt,
    };
  }

  /**
   * Disconnect a Clarity connection from the workspace.
   * Preserves historical analytics snapshots and unlinks active websites.
   */
  async disconnectConnection({ workspaceId, connectionId, user }) {
    const connection = await prisma.clarityConnection.findFirst({
      where: { id: connectionId, workspaceId },
    });

    if (!connection) {
      throw new NotFoundError('Clarity connection not found in this workspace.');
    }

    // 1. Unlink website integration records without deleting historical snapshots
    await prisma.integrationConnection.updateMany({
      where: { clarityConnectionId: connection.id },
      data: {
        clarityConnectionId: null,
        status: 'NOT_CONNECTED',
        lastError: 'Clarity project disconnected from workspace.',
      },
    });

    // 2. Delete connection record (snapshots will be cascade-deleted or preserved if preferred)
    await prisma.clarityConnection.delete({
      where: { id: connection.id },
    });

    // 3. Audit Log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'integration.clarity_disconnected',
        entityType: 'ClarityConnection',
        entityId: connection.id,
        metadata: { projectId: connection.projectId },
      },
    });

    logger.info(`Clarity project ${connection.projectId} disconnected from workspace ${workspaceId}`);

    return {
      success: true,
      message: `Clarity project "${connection.projectName || connection.projectId}" disconnected successfully.`,
    };
  }

  /**
   * Internal helper: Decrypt API token in memory for active Data Export calls.
   * Strictly never exposes the token to outer controllers or frontend responses.
   */
  async getDecryptedToken(workspaceId, connectionId) {
    const connection = await prisma.clarityConnection.findFirst({
      where: { id: connectionId, workspaceId },
    });

    if (!connection) {
      throw new NotFoundError('Clarity connection not found.');
    }

    if (connection.status !== 'CONNECTED') {
      throw new BadRequestError('Clarity connection is not active or token has been revoked.');
    }

    const token = decrypt(connection.apiTokenEnc);
    if (!token) {
      throw new AppError('Failed to decrypt Clarity API token. Key configuration may have changed.', 500);
    }

    return {
      connection,
      token,
    };
  }

  /**
   * Check daily 10-call quota and increment.
   * Automatically resets counter if UTC date has changed.
   */
  async checkAndIncrementQuota(connectionId) {
    const connection = await prisma.clarityConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundError('Clarity connection not found.');
    }

    const now = new Date();
    const currentUtcDay = getStartOfUtcDay();

    let callsToday = connection.apiCallsToday;
    if (!connection.apiCallsResetAt || new Date(connection.apiCallsResetAt) < currentUtcDay) {
      // Day has rolled over in UTC
      callsToday = 0;
    }

    if (callsToday >= DAILY_QUOTA_LIMIT) {
      throw new AppError(
        `Microsoft Clarity daily quota limit reached (${DAILY_QUOTA_LIMIT} requests per project per day). Please wait until the next UTC day.`,
        429
      );
    }

    // Increment counter
    await prisma.clarityConnection.update({
      where: { id: connectionId },
      data: {
        apiCallsToday: callsToday + 1,
        apiCallsResetAt: currentUtcDay,
        lastSyncAt: now,
      },
    });

    return {
      currentCall: callsToday + 1,
      callsRemaining: DAILY_QUOTA_LIMIT - (callsToday + 1),
    };
  }
}

export const clarityConnectionService = new ClarityConnectionService();
export default clarityConnectionService;
