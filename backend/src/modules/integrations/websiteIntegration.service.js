// backend/src/modules/integrations/websiteIntegration.service.js
// Service for binding and managing website integration properties (GA4, GSC).

import prisma from '../../config/database.js';
import { NotFoundError, BadRequestError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

export class WebsiteIntegrationService {
  /**
   * Get all external integration statuses for a website.
   * Ensures GA4, GSC, and CLARITY states are consistently represented.
   */
  async getWebsiteIntegrations(workspaceId, websiteId) {
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
      include: {
        integrations: {
          include: {
            googleAccount: {
              select: {
                id: true,
                email: true,
                displayName: true,
                avatarUrl: true,
                status: true,
              },
            },
            clarityConnection: {
              select: {
                id: true,
                projectId: true,
                projectName: true,
                status: true,
                apiCallsToday: true,
                lastSyncAt: true,
              },
            },
          },
        },
      },
    });

    if (!website) {
      throw new NotFoundError('Website not found in this workspace.');
    }

    const standardTypes = ['GA4', 'GSC', 'CLARITY'];
    const integrationsMap = new Map(
      website.integrations.map((conn) => [conn.integrationType, conn])
    );

    return standardTypes.map((type) => {
      const existing = integrationsMap.get(type);
      if (existing) {
        return existing;
      }
      return {
        id: null,
        websiteId,
        workspaceId,
        integrationType: type,
        status: 'NOT_CONNECTED',
        selectedProperty: null,
        selectedPropertyName: null,
        googleAccountId: null,
        googleAccount: null,
        lastSyncAt: null,
        lastSyncStatus: null,
        lastError: null,
      };
    });
  }

  /**
   * Bind a GA4 or GSC property to a website.
   */
  async connectProperty({
    workspaceId,
    websiteId,
    integrationType,
    googleAccountId,
    selectedProperty,
    selectedPropertyName,
    user,
  }) {
    if (!['GA4', 'GSC'].includes(integrationType)) {
      throw new BadRequestError('Only GA4 and GSC integrations are supported in this service.');
    }

    if (!selectedProperty) {
      throw new BadRequestError('A selected property or site URL is required.');
    }

    // Verify website belongs to workspace
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
    });
    if (!website) {
      throw new NotFoundError('Website not found in this workspace.');
    }

    // Verify googleAccount belongs to workspace and is connected
    const googleAccount = await prisma.googleAccount.findFirst({
      where: { id: googleAccountId, workspaceId },
    });
    if (!googleAccount) {
      throw new NotFoundError('Connected Google account not found in this workspace.');
    }

    if (googleAccount.status !== 'CONNECTED') {
      throw new BadRequestError(
        'The selected Google account is not active. Please reconnect or re-authorize it first.'
      );
    }

    // Upsert integration connection
    const connection = await prisma.integrationConnection.upsert({
      where: {
        websiteId_integrationType: {
          websiteId,
          integrationType,
        },
      },
      update: {
        workspaceId,
        googleAccountId,
        selectedProperty,
        selectedPropertyName: selectedPropertyName || selectedProperty,
        status: 'CONNECTED',
        lastError: null,
      },
      create: {
        websiteId,
        workspaceId,
        googleAccountId,
        integrationType,
        selectedProperty,
        selectedPropertyName: selectedPropertyName || selectedProperty,
        status: 'CONNECTED',
      },
      include: {
        googleAccount: {
          select: {
            id: true,
            email: true,
            displayName: true,
            avatarUrl: true,
            status: true,
          },
        },
      },
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: `integration.${integrationType.toLowerCase()}_connected`,
        entityType: 'IntegrationConnection',
        entityId: connection.id,
        metadata: {
          websiteId,
          integrationType,
          selectedProperty,
          selectedPropertyName,
          googleEmail: googleAccount.email,
        },
      },
    });

    logger.info(
      `Connected ${integrationType} property "${selectedProperty}" to website ${website.domain} by user ${user.id}`
    );

    return connection;
  }

  /**
   * Disconnect an integration from a website.
   */
  async disconnectProperty({ workspaceId, websiteId, integrationType, user }) {
    const connection = await prisma.integrationConnection.findFirst({
      where: { websiteId, workspaceId, integrationType },
    });

    if (!connection) {
      throw new NotFoundError(`No ${integrationType} integration found for this website.`);
    }

    const updated = await prisma.integrationConnection.update({
      where: { id: connection.id },
      data: {
        status: 'NOT_CONNECTED',
        selectedProperty: null,
        selectedPropertyName: null,
        googleAccountId: null,
        clarityConnectionId: null,
        lastError: null,
      },
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: `integration.${integrationType.toLowerCase()}_disconnected`,
        entityType: 'IntegrationConnection',
        entityId: connection.id,
        metadata: {
          websiteId,
          integrationType,
        },
      },
    });

    logger.info(
      `Disconnected ${integrationType} from website ${websiteId} by user ${user.id}`
    );

    return updated;
  }
}

export const websiteIntegrationService = new WebsiteIntegrationService();
export default websiteIntegrationService;
