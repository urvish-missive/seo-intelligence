// backend/src/modules/integrations/clarity/clarity.controller.js
// Express controller for Microsoft Clarity connections, mapping, manual data imports, and offline analytics.

import clarityConnectionService from './clarityConnection.service.js';
import clarityMappingService from './clarityMapping.service.js';
import clarityImportService from './clarityImport.service.js';
import clarityDataService from './clarityData.service.js';
import { ApiResponse } from '../../../utils/apiResponse.js';

/**
 * Validate token and connect a Microsoft Clarity project to a workspace.
 */
export async function createConnection(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const { projectId, projectName, apiToken } = req.body;

    const result = await clarityConnectionService.createConnection({
      workspaceId,
      projectId,
      projectName,
      apiToken,
      user: req.user,
    });

    return ApiResponse.success(res, result, 'Microsoft Clarity project connected successfully', 201);
  } catch (err) {
    next(err);
  }
}

/**
 * List all connected Microsoft Clarity projects in a workspace.
 */
export async function listConnections(req, res, next) {
  try {
    const { workspaceId } = req.params;
    const connections = await clarityConnectionService.listConnections(workspaceId);
    return ApiResponse.success(res, connections, 'Clarity connections retrieved successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * Get single Clarity connection by ID.
 */
export async function getConnection(req, res, next) {
  try {
    const { workspaceId, connectionId } = req.params;
    const connection = await clarityConnectionService.getConnectionById(workspaceId, connectionId);
    return ApiResponse.success(res, connection, 'Clarity connection details retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * Replace the API token for an existing Clarity connection.
 */
export async function replaceToken(req, res, next) {
  try {
    const { workspaceId, connectionId } = req.params;
    const { apiToken, projectName } = req.body;

    const result = await clarityConnectionService.replaceToken({
      workspaceId,
      connectionId,
      apiToken,
      projectName,
      user: req.user,
    });

    return ApiResponse.success(res, result, 'Clarity API token replaced successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * Disconnect a Clarity connection from a workspace.
 */
export async function disconnectConnection(req, res, next) {
  try {
    const { workspaceId, connectionId } = req.params;
    const result = await clarityConnectionService.disconnectConnection({
      workspaceId,
      connectionId,
      user: req.user,
    });

    return ApiResponse.success(res, result, 'Clarity connection removed');
  } catch (err) {
    next(err);
  }
}

/**
 * Map a website to a Clarity connection.
 */
export async function mapWebsite(req, res, next) {
  try {
    const { workspaceId, websiteId } = req.params;
    const { clarityConnectionId } = req.body;

    const result = await clarityMappingService.mapWebsiteToClarity({
      workspaceId,
      websiteId,
      clarityConnectionId,
      user: req.user,
    });

    return ApiResponse.success(res, result, 'Website mapped to Clarity project successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * Unmap a website from Clarity.
 */
export async function unmapWebsite(req, res, next) {
  try {
    const { workspaceId, websiteId } = req.params;
    const result = await clarityMappingService.unmapWebsiteFromClarity({
      workspaceId,
      websiteId,
      user: req.user,
    });

    return ApiResponse.success(res, result, 'Clarity mapping removed from website');
  } catch (err) {
    next(err);
  }
}

/**
 * Execute a manual data import from Microsoft Clarity.
 */
export async function executeImport(req, res, next) {
  try {
    const { workspaceId, websiteId } = req.params;
    const { numOfDays, preset } = req.body;

    const result = await clarityImportService.executeManualImport({
      workspaceId,
      websiteId,
      numOfDays,
      preset,
      user: req.user,
    });

    return ApiResponse.success(res, result, 'Clarity data imported and stored successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * Get offline UX and behavioral friction analytics from local MySQL.
 */
export async function getClarityOverview(req, res, next) {
  try {
    const { workspaceId, websiteId } = req.params;
    const result = await clarityDataService.getClarityOverview(workspaceId, websiteId);
    return ApiResponse.success(res, result, 'Stored Clarity analytics retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * List historical Clarity snapshots for a website.
 */
export async function listSnapshots(req, res, next) {
  try {
    const { workspaceId, websiteId } = req.params;
    const { limit, offset } = req.query;

    const result = await clarityDataService.listSnapshots(workspaceId, websiteId, {
      limit,
      offset,
    });

    return ApiResponse.success(res, result, 'Clarity snapshots retrieved');
  } catch (err) {
    next(err);
  }
}

/**
 * Get single Clarity snapshot with raw JSON inspection.
 */
export async function getSnapshotById(req, res, next) {
  try {
    const { workspaceId, websiteId, snapshotId } = req.params;
    const result = await clarityDataService.getSnapshotById(workspaceId, websiteId, snapshotId);
    return ApiResponse.success(res, result, 'Clarity snapshot details retrieved');
  } catch (err) {
    next(err);
  }
}
