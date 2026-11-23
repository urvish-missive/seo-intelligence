// backend/src/modules/integrations/google/googleClient.factory.js
// Factory for creating authenticated Google OAuth2, GA4, and GSC client instances.

import { google } from 'googleapis';
import { env } from '../../../config/environment.js';
import { decrypt, encrypt } from '../../../utils/encryption.js';
import prisma from '../../../config/database.js';
import logger from '../../../utils/logger.js';

export class GoogleClientFactory {
  /**
   * Create an unauthenticated OAuth2 client for authorization URLs and code exchanges.
   */
  static createOAuth2Client() {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new Error(
        'Google OAuth credentials missing. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.'
      );
    }

    return new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI
    );
  }

  /**
   * Create an authenticated OAuth2 client from a GoogleAccount database record.
   * Automatically refreshes expired tokens and updates the database.
   *
   * @param {object} googleAccount - prisma GoogleAccount record
   * @returns {Promise<google.auth.OAuth2>} Authenticated OAuth2 client
   */
  static async getAuthenticatedClient(googleAccount) {
    if (!googleAccount) {
      throw new Error('GoogleAccount record is required.');
    }

    const oauth2Client = this.createOAuth2Client();

    const accessToken = decrypt(googleAccount.accessTokenEnc);
    const refreshToken = decrypt(googleAccount.refreshTokenEnc);

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: googleAccount.tokenExpiresAt ? new Date(googleAccount.tokenExpiresAt).getTime() : undefined,
    });

    // Listen for automatic token refreshes by google-auth-library
    oauth2Client.on('tokens', async (tokens) => {
      try {
        const updateData = {
          lastRefreshedAt: new Date(),
          status: 'CONNECTED',
        };

        if (tokens.access_token) {
          updateData.accessTokenEnc = encrypt(tokens.access_token);
        }
        if (tokens.refresh_token) {
          updateData.refreshTokenEnc = encrypt(tokens.refresh_token);
        }
        if (tokens.expiry_date) {
          updateData.tokenExpiresAt = new Date(tokens.expiry_date);
        }

        await prisma.googleAccount.update({
          where: { id: googleAccount.id },
          data: updateData,
        });

        logger.info(`Successfully updated refreshed tokens for Google account ${googleAccount.email}`);
      } catch (err) {
        logger.error(`Failed to persist refreshed Google tokens: ${err.message}`);
      }
    });

    // Proactive refresh if token is within 5 minutes of expiring
    const isExpiringSoon =
      googleAccount.tokenExpiresAt &&
      new Date(googleAccount.tokenExpiresAt).getTime() - Date.now() < 5 * 60 * 1000;

    if (isExpiringSoon && refreshToken) {
      try {
        logger.info(`Proactively refreshing tokens for Google account ${googleAccount.email}`);
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);

        await prisma.googleAccount.update({
          where: { id: googleAccount.id },
          data: {
            accessTokenEnc: encrypt(credentials.access_token),
            tokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : undefined,
            lastRefreshedAt: new Date(),
            status: 'CONNECTED',
          },
        });
      } catch (refreshErr) {
        logger.error(`Error proactively refreshing token: ${refreshErr.message}`);
        if (refreshErr.message?.includes('invalid_grant')) {
          await prisma.googleAccount.update({
            where: { id: googleAccount.id },
            data: { status: 'REVOKED' },
          });
          throw new Error('Google authorization has been revoked or expired. Please re-authenticate.');
        }
      }
    }

    return oauth2Client;
  }

  /**
   * Get authenticated Google Analytics Admin API client (v1beta).
   */
  static async getAnalyticsAdminClient(googleAccount) {
    const auth = await this.getAuthenticatedClient(googleAccount);
    return google.analyticsadmin({ version: 'v1beta', auth });
  }

  /**
   * Get authenticated Google Analytics Data API client (v1beta).
   */
  static async getAnalyticsDataClient(googleAccount) {
    const auth = await this.getAuthenticatedClient(googleAccount);
    return google.analyticsdata({ version: 'v1beta', auth });
  }

  /**
   * Get authenticated Google Search Console API client (v1).
   */
  static async getSearchConsoleClient(googleAccount) {
    const auth = await this.getAuthenticatedClient(googleAccount);
    return google.searchconsole({ version: 'v1', auth });
  }
}

export default GoogleClientFactory;
