// backend/src/modules/integrations/gsc/gscAdmin.service.js
// Service for discovering Google Search Console verified sites accessible to a Google Account.

import GoogleClientFactory from '../google/googleClient.factory.js';
import prisma from '../../../config/database.js';
import { NotFoundError, BadRequestError } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';

export class GSCAdminService {
  /**
   * Discover and list all verified Search Console properties (sites) accessible to the Google account.
   *
   * @param {string} workspaceId
   * @param {string} googleAccountId
   * @returns {Promise<Array<{ siteUrl: string, permissionLevel: string, isDomainProperty: boolean }>>}
   */
  async listSites(workspaceId, googleAccountId) {
    const googleAccount = await prisma.googleAccount.findFirst({
      where: { id: googleAccountId, workspaceId },
    });

    if (!googleAccount) {
      throw new NotFoundError('Google account not found in this workspace.');
    }

    try {
      const gscClient = await GoogleClientFactory.getSearchConsoleClient(googleAccount);

      const response = await gscClient.sites.list();
      const siteEntries = response.data.siteEntry || [];

      const sites = siteEntries.map((site) => ({
        siteUrl: site.siteUrl, // e.g. "sc-domain:example.com" or "https://example.com/"
        permissionLevel: site.permissionLevel, // e.g. "siteOwner", "siteFullUser"
        isDomainProperty: site.siteUrl.startsWith('sc-domain:'),
      }));

      logger.info(
        `Discovered ${sites.length} GSC sites for Google account ${googleAccount.email}`
      );

      return sites;
    } catch (err) {
      logger.error(`Failed to list GSC sites: ${err.message}`);
      if (err.message?.includes('invalid_grant')) {
        throw new BadRequestError('Google authorization expired or revoked. Please re-authenticate.');
      }
      throw new BadRequestError(`Search Console site discovery failed: ${err.message}`);
    }
  }
}

export const gscAdminService = new GSCAdminService();
export default gscAdminService;
