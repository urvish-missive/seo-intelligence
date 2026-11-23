// backend/src/modules/clients/client.controller.js
import { clientService } from './client.service.js';
import { successResponse, createdResponse, paginatedResponse } from '../../utils/apiResponse.js';

export async function listClients(req, res, next) {
  try {
    const { search, status, page, limit, sortBy, sortDir } = req.query;
    const result = await clientService.listClients(req.params.workspaceId, req.user, {
      search,
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      sortBy: sortBy || 'createdAt',
      sortDir: sortDir || 'desc',
    });
    return paginatedResponse(res, result.clients, result.pagination, 'Clients retrieved');
  } catch (err) {
    next(err);
  }
}

export async function getClient(req, res, next) {
  try {
    const client = await clientService.getClientById(req.params.workspaceId, req.params.clientId);
    return successResponse(res, client, 'Client details');
  } catch (err) {
    next(err);
  }
}

export async function createClient(req, res, next) {
  try {
    const client = await clientService.createClient(req.params.workspaceId, req.user.id, req.body);
    return createdResponse(res, client, 'Client created successfully');
  } catch (err) {
    next(err);
  }
}

export async function updateClient(req, res, next) {
  try {
    const client = await clientService.updateClient(
      req.params.workspaceId,
      req.params.clientId,
      req.user.id,
      req.body
    );
    return successResponse(res, client, 'Client updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function archiveClient(req, res, next) {
  try {
    const client = await clientService.toggleArchiveClient(
      req.params.workspaceId,
      req.params.clientId,
      req.user.id
    );
    return successResponse(res, client, `Client ${client.status.toLowerCase()} successfully`);
  } catch (err) {
    next(err);
  }
}

export async function deleteClient(req, res, next) {
  try {
    const result = await clientService.deleteClient(
      req.params.workspaceId,
      req.params.clientId,
      req.user.id
    );
    return successResponse(res, null, result.message);
  } catch (err) {
    next(err);
  }
}

export async function assignMember(req, res, next) {
  try {
    const assignment = await clientService.assignMember(
      req.params.workspaceId,
      req.params.clientId,
      req.body.userId,
      req.user.id
    );
    return createdResponse(res, assignment, 'Member assigned to client');
  } catch (err) {
    next(err);
  }
}

export async function removeMember(req, res, next) {
  try {
    const result = await clientService.removeMember(
      req.params.workspaceId,
      req.params.clientId,
      req.params.userId,
      req.user.id
    );
    return successResponse(res, null, result.message);
  } catch (err) {
    next(err);
  }
}
