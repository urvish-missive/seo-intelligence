// backend/src/modules/websites/website.controller.js
import { websiteService } from './website.service.js';
import { successResponse, createdResponse } from '../../utils/apiResponse.js';

export async function listWebsites(req, res, next) {
  try {
    const { clientId, status, search } = req.query;
    const websites = await websiteService.listWebsites(req.params.workspaceId, req.user, {
      clientId: clientId || req.params.clientId,
      status,
      search,
    });
    return successResponse(res, websites, 'Websites retrieved');
  } catch (err) {
    next(err);
  }
}

export async function getWebsite(req, res, next) {
  try {
    const website = await websiteService.getWebsiteById(
      req.params.workspaceId,
      req.params.websiteId
    );
    return successResponse(res, website, 'Website details');
  } catch (err) {
    next(err);
  }
}

export async function createWebsite(req, res, next) {
  try {
    const website = await websiteService.createWebsite(
      req.params.workspaceId,
      req.params.clientId,
      req.user.id,
      req.body
    );
    return createdResponse(res, website, 'Website registered successfully');
  } catch (err) {
    next(err);
  }
}

export async function updateWebsite(req, res, next) {
  try {
    const website = await websiteService.updateWebsite(
      req.params.workspaceId,
      req.params.websiteId,
      req.user.id,
      req.body
    );
    return successResponse(res, website, 'Website updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function archiveWebsite(req, res, next) {
  try {
    const website = await websiteService.toggleArchiveWebsite(
      req.params.workspaceId,
      req.params.websiteId,
      req.user.id
    );
    return successResponse(res, website, `Website ${website.status.toLowerCase()} successfully`);
  } catch (err) {
    next(err);
  }
}

export async function deleteWebsite(req, res, next) {
  try {
    const result = await websiteService.deleteWebsite(
      req.params.workspaceId,
      req.params.websiteId,
      req.user.id
    );
    return successResponse(res, null, result.message);
  } catch (err) {
    next(err);
  }
}
