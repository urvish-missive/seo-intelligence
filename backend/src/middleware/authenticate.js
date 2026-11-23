// backend/src/middleware/authenticate.js
// JWT authentication middleware — verifies access token and establishes user security context.

import { verifyAccessToken } from '../modules/auth/auth.utils.js';
import { UnauthorisedError, ForbiddenError } from './errorHandler.js';
import prisma from '../config/database.js';

export async function authenticate(req, res, next) {
  try {
    let token = null;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies?.access_token) {
      token = req.cookies.access_token;
    } else if (req.query?.token) {
      token = req.query.token;
    }

    if (!token) {
      throw new UnauthorisedError('Authentication token required');
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorisedError('Access token has expired');
      }
      throw new UnauthorisedError('Invalid authentication token');
    }

    // Attach user payload
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      workspaceId: decoded.workspaceId || null,
      role: decoded.role || null,
      roleId: decoded.roleId || null,
      permissions: decoded.permissions || [],
      sessionId: decoded.sessionId || null,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional authentication: populates req.user if a valid token is provided,
 * otherwise proceeds as unauthenticated without throwing an error.
 */
export async function optionalAuthenticate(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies?.access_token) {
      token = req.cookies.access_token;
    } else if (req.query?.token) {
      token = req.query.token;
    }

    if (token) {
      const decoded = verifyAccessToken(token);
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        workspaceId: decoded.workspaceId || null,
        role: decoded.role || null,
        roleId: decoded.roleId || null,
        permissions: decoded.permissions || [],
        sessionId: decoded.sessionId || null,
      };
    }
    next();
  } catch {
    next();
  }
}
