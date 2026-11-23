// backend/src/modules/integrations/clarity/clarityMapping.service.js
// Service for associating/unassociating Microsoft Clarity projects with client websites.

import prisma from '../../../config/database.js';
import { NotFoundError, BadRequestError } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';

export class ClarityMappingService {
  /**
   * Associate an authorized Clarity connection with a specific website in the workspace.
   */
  async mapWebsiteToClarity({ workspaceId, websiteId, clarityConnectionId, user }) {
    if (!clarityConnectionId) {
      throw new BadRequestError('clarityConnectionId is required.');
    }

    // 1. Verify website belongs to workspace
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
    });
    if (!website) {
      throw new NotFoundError('Target website not found in this workspace.');
    }

    // 2. Verify clarity connection belongs to workspace and is active
    const clarityConn = await prisma.clarityConnection.findFirst({
      where: { id: clarityConnectionId, workspaceId },
    });
    if (!clarityConn) {
      throw new NotFoundError('Clarity connection not found in this workspace.');
    }

    if (clarityConn.status !== 'CONNECTED') {
      throw new BadRequestError(
        'The selected Clarity project connection is not active. Please re-validate its API token.'
      );
    }

    // 3. Upsert IntegrationConnection for CLARITY
    const connection = await prisma.integrationConnection.upsert({
      where: {
        websiteId_integrationType: {
          websiteId,
          integrationType: 'CLARITY',
        },
      },
      update: {
        workspaceId,
        clarityConnectionId: clarityConn.id,
        selectedProperty: clarityConn.projectId,
        selectedPropertyName: clarityConn.projectName || clarityConn.projectId,
        status: 'CONNECTED',
        lastError: null,
      },
      create: {
        websiteId,
        workspaceId,
        clarityConnectionId: clarityConn.id,
        integrationType: 'CLARITY',
        selectedProperty: clarityConn.projectId,
        selectedPropertyName: clarityConn.projectName || clarityConn.projectId,
        status: 'CONNECTED',
      },
      include: {
        clarityConnection: {
          select: {
            id: true,
            projectId: true,
            projectName: true,
            status: true,
            lastValidatedAt: true,
          },
        },
      },
    });

    // 4. Audit Log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user?.id || null,
        action: 'integration.clarity_mapped',
        entityType: 'IntegrationConnection',
        entityId: connection.id,
        metadata: {
          websiteId,
          clarityProjectId: clarityConn.projectId,
        },
      },
    });

    logger.info(
      `Mapped Clarity project ${clarityConn.projectId} to website ${website.domain} by user ${user?.id || 'system'}`
    );

    return connection;
  }

  /**
   * Remove the Clarity mapping from a website without deleting historical analytics.
   */
  async unmapWebsiteFromClarity({ workspaceId, websiteId, user }) {
    const connection = await prisma.integrationConnection.findFirst({
      where: { websiteId, workspaceId, integrationType: 'CLARITY' },
    });

    if (!connection) {
      throw new NotFoundError('No Clarity integration found for this website.');
    }

    const updated = await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        clarityConnectionId: null,
        status: 'NOT_CONNECTED',
        selectedProperty: null,
        selectedPropertyName: null,
        lastError: null,
      },
    });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user?.id || null,
        action: 'integration.clarity_unmapped',
        entityType: 'IntegrationConnection',
        entityId: connection.id,
        metadata: { websiteId },
      },
    });

    logger.info(`Unmapped Clarity from website ${websiteId} by user ${user?.id || 'system'}`);

    return updated;
  }
}

export const clarityMappingService = new ClarityMappingService();
export default clarityMappingService;
