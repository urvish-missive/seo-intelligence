// backend/src/modules/auth/auth.utils.js
// Authentication utilities — Argon2 hashing, JWT generation, token hashing, cookie config.

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { env } from '../../config/environment.js';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

/**
 * Hash plaintext password using Argon2id
 */
export async function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verify plaintext password against Argon2id hash
 */
export async function verifyPassword(hash, password) {
  return argon2.verify(hash, password);
}

/**
 * Generate secure random token (e.g. for refresh tokens, reset tokens, invitations)
 */
export function generateRandomToken(bytes = 40) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Compute SHA-256 hash of a token for secure database storage
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Sign access JWT containing user context, active workspace, role, and permissions
 */
export function signAccessToken(payload) {
  const secret = process.env.JWT_ACCESS_SECRET || env.JWT_SECRET;
  const expiresIn = process.env.JWT_ACCESS_EXPIRES_IN || env.JWT_EXPIRY || '15m';

  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * Verify access JWT
 */
export function verifyAccessToken(token) {
  const secret = process.env.JWT_ACCESS_SECRET || env.JWT_SECRET;
  return jwt.verify(token, secret);
}

/**
 * Cookie options for refresh tokens
 */
export function getRefreshTokenCookieOptions() {
  const isProduction = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  };
}

/**
 * Clear refresh token cookie options
 */
export function getClearCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/',
  };
}
