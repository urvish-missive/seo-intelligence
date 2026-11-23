// backend/src/modules/auth/auth.controller.js
// Authentication controllers.

import { authService } from './auth.service.js';
import { successResponse, createdResponse } from '../../utils/apiResponse.js';
import { getRefreshTokenCookieOptions, getClearCookieOptions } from './auth.utils.js';

export async function register(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await authService.register(req.body, ipAddress, userAgent);

    res.cookie('refresh_token', result.refreshToken, getRefreshTokenCookieOptions());

    return createdResponse(
      res,
      {
        accessToken: result.accessToken,
        user: result.user,
        workspace: result.workspace,
        role: result.role,
        permissions: result.permissions,
        workspaces: result.workspaces,
      },
      'User registered successfully'
    );
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await authService.login(req.body, ipAddress, userAgent);

    res.cookie('refresh_token', result.refreshToken, getRefreshTokenCookieOptions());

    return successResponse(
      res,
      {
        accessToken: result.accessToken,
        user: result.user,
        workspace: result.workspace,
        role: result.role,
        permissions: result.permissions,
        workspaces: result.workspaces,
      },
      'Logged in successfully'
    );
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;

    const result = await authService.refreshAccessToken(refreshToken, ipAddress, userAgent);

    res.cookie('refresh_token', result.refreshToken, getRefreshTokenCookieOptions());

    return successResponse(
      res,
      {
        accessToken: result.accessToken,
        user: result.user,
        workspace: result.workspace,
        role: result.role,
        permissions: result.permissions,
        workspaces: result.workspaces,
      },
      'Token refreshed successfully'
    );
  } catch (err) {
    res.clearCookie('refresh_token', getClearCookieOptions());
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
    await authService.logout(refreshToken);

    res.clearCookie('refresh_token', getClearCookieOptions());

    return successResponse(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
}

export async function getMe(req, res, next) {
  try {
    const workspaceId = req.query.workspaceId || req.user?.workspaceId;
    const context = await authService.getMe(req.user.id, workspaceId);

    return successResponse(res, context, 'Current user profile');
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await authService.changePassword(
      req.user.id,
      req.body.currentPassword,
      req.body.newPassword,
      ipAddress,
      userAgent
    );

    res.cookie('refresh_token', result.refreshToken, getRefreshTokenCookieOptions());

    return successResponse(
      res,
      { accessToken: result.accessToken },
      'Password changed successfully'
    );
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const result = await authService.forgotPassword(req.body.email);
    return successResponse(res, result, result.message);
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await authService.resetPassword(
      req.body.token,
      req.body.newPassword,
      ipAddress,
      userAgent
    );

    return successResponse(res, null, result.message);
  } catch (err) {
    next(err);
  }
}
