// backend/src/modules/integrations/integrations.controller.js
// Controller for Google OAuth, property discovery, website binding, and manual data sync.

import googleAuthService from './google/googleAuth.service.js';
import ga4AdminService from './ga4/ga4Admin.service.js';
import gscAdminService from './gsc/gscAdmin.service.js';
import websiteIntegrationService from './websiteIntegration.service.js';
import ga4DataService from './ga4/ga4Data.service.js';
import gscDataService from './gsc/gscData.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { env } from '../../config/environment.js';
import logger from '../../utils/logger.js';

/**
 * Generate Google OAuth authorization URL.
 */
export async function getGoogleAuthUrl(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const result = await googleAuthService.generateAuthorizationUrl(workspaceId, req.user);
    return ApiResponse.success(res, result, 'Google OAuth URL generated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * Handle Google OAuth callback redirect from Google servers.
 */
export async function handleGoogleCallback(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    logger.warn(`Google OAuth consent denied or failed: ${error}`);
    return res.redirect(`${env.FRONTEND_URL}/settings/integrations?error=${encodeURIComponent(error)}`);
  }

  try {
    await googleAuthService.handleCallback(code, state);
    return res.redirect(`${env.FRONTEND_URL}/settings/integrations?google_connected=true`);
  } catch (err) {
    logger.error(`Google OAuth callback failed: ${err.message}`);
    return res.redirect(
      `${env.FRONTEND_URL}/settings/integrations?error=${encodeURIComponent(err.message)}`
    );
  }
}

/**
 * List connected Google accounts in a workspace.
 */
export async function listGoogleAccounts(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const accounts = await googleAuthService.listAccounts(workspaceId);
    return ApiResponse.success(res, accounts, 'Connected Google accounts retrieved successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * Disconnect a Google account from a workspace.
 */
export async function disconnectGoogleAccount(req, res, next) {
  try {
    const { workspaceId, accountId } = req.params;
    const result = await googleAuthService.disconnectAccount(workspaceId, accountId, req.user);
    return ApiResponse.success(res, result, 'Google account disconnected successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * List GA4 properties for a connected Google account.
 */
export async function listGA4Properties(req, res, next) {
  try {
    const { workspaceId, accountId } = req.params;
    const properties = await ga4AdminService.listProperties(workspaceId, accountId);
    return ApiResponse.success(res, properties, 'GA4 properties discovered successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * List Google Search Console verified sites for a connected Google account.
 */
export async function listGSCSites(req, res, next) {
  try {
    const { workspaceId, accountId } = req.params;
    const sites = await gscAdminService.listSites(workspaceId, accountId);
    return ApiResponse.success(res, sites, 'Search Console sites discovered successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * Get all integration statuses for a specific website.
 */
export async function getWebsiteIntegrations(req, res, next) {
  try {
    const { workspaceId, websiteId } = req.params;
    const integrations = await websiteIntegrationService.getWebsiteIntegrations(
      workspaceId,
      websiteId
    );
    return ApiResponse.success(res, integrations, 'Website integrations retrieved successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * Connect a GA4 or GSC property to a website.
 */
export async function connectWebsiteProperty(req, res, next) {
  try {
    const { workspaceId, websiteId } = req.params;
    const { integrationType, googleAccountId, selectedProperty, selectedPropertyName } = req.body;

    const connection = await websiteIntegrationService.connectProperty({
      workspaceId,
      websiteId,
      integrationType,
      googleAccountId,
      selectedProperty,
      selectedPropertyName,
      user: req.user,
    });

    return ApiResponse.success(res, connection, `${integrationType} property connected successfully`);
  } catch (err) {
    next(err);
  }
}

/**
 * Disconnect an integration from a website.
 */
export async function disconnectWebsiteProperty(req, res, next) {
  try {
    const { workspaceId, websiteId } = req.params;
    const { integrationType } = req.body;

    const result = await websiteIntegrationService.disconnectProperty({
      workspaceId,
      websiteId,
      integrationType,
      user: req.user,
    });

    return ApiResponse.success(res, result, `${integrationType} integration disconnected successfully`);
  } catch (err) {
    next(err);
  }
}

/**
 * Trigger manual data sync / import for GA4 or GSC.
 */
export async function triggerManualSync(req, res, next) {
  try {
    const { workspaceId, websiteId } = req.params;
    const { integrationType, startDate, endDate } = req.body;

    let result;
    if (integrationType === 'GA4') {
      result = await ga4DataService.importGA4Data({
        workspaceId,
        websiteId,
        startDate,
        endDate,
        user: req.user,
      });
    } else if (integrationType === 'GSC') {
      result = await gscDataService.importGSCData({
        workspaceId,
        websiteId,
        startDate,
        endDate,
        user: req.user,
      });
    } else {
      return ApiResponse.error(res, 'Unsupported integration type for manual sync', 400);
    }

    return ApiResponse.success(res, result, `${integrationType} data imported successfully`);
  } catch (err) {
    next(err);
  }
}
