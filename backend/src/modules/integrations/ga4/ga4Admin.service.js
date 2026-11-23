// backend/src/modules/integrations/ga4/ga4Admin.service.js
// Service for discovering Google Analytics 4 properties accessible to a Google Account.

import GoogleClientFactory from '../google/googleClient.factory.js';
import prisma from '../../../config/database.js';
import { NotFoundError, BadRequestError } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';

export class GA4AdminService {
  /**
   * Discover and list all GA4 properties accessible to the specified Google account.
   *
   * @param {string} workspaceId
   * @param {string} googleAccountId
   * @returns {Promise<Array<{ propertyId: string, displayName: string, timeZone: string, currencyCode: string }>>}
   */
  async listProperties(workspaceId, googleAccountId) {
    const googleAccount = await prisma.googleAccount.findFirst({
      where: { id: googleAccountId, workspaceId },
    });

    if (!googleAccount) {
      throw new NotFoundError('Google account not found in this workspace.');
    }

    try {
      const adminClient = await GoogleClientFactory.getAnalyticsAdminClient(googleAccount);

      const properties = [];
      let pageToken;

      do {
        const response = await adminClient.accountSummaries.list({
          pageSize: 100,
          pageToken,
        });

        const summaries = response.data.accountSummaries || [];
        for (const summary of summaries) {
          const propertySummaries = summary.propertySummaries || [];
          for (const prop of propertySummaries) {
            properties.push({
              propertyId: prop.property, // Format: "properties/123456789"
              numericId: prop.property.replace('properties/', ''),
              displayName: prop.displayName,
              propertyType: prop.propertyType,
              accountName: summary.displayName,
              accountId: summary.account,
            });
          }
        }

        pageToken = response.data.nextPageToken;
      } while (pageToken);

      logger.info(
        `Discovered ${properties.length} GA4 properties for Google account ${googleAccount.email}`
      );

      return properties;
    } catch (err) {
      logger.error(`Failed to list GA4 properties: ${err.message}`);
      if (err.message?.includes('invalid_grant')) {
        throw new BadRequestError('Google authorization expired or revoked. Please re-authenticate.');
      }
      throw new BadRequestError(`GA4 property discovery failed: ${err.message}`);
    }
  }
}

export const ga4AdminService = new GA4AdminService();
export default ga4AdminService;
