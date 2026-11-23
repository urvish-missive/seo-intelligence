// backend/tests/unit/auth.utils.test.js
import { describe, it, expect } from '@jest/globals';
import {
  hashPassword,
  verifyPassword,
  generateRandomToken,
  hashToken,
  signAccessToken,
  verifyAccessToken,
} from '../../src/modules/auth/auth.utils.js';

describe('Authentication Utilities Unit Tests', () => {
  it('should hash a password using Argon2id and verify it correctly', async () => {
    const password = 'TestSecurePassword123!';
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).toContain('$argon2id$');

    const isValid = await verifyPassword(hash, password);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword(hash, 'WrongPassword!');
    expect(isInvalid).toBe(false);
  });

  it('should generate secure random tokens with specified byte length', () => {
    const token = generateRandomToken(32);
    expect(token).toBeDefined();
    expect(token.length).toBe(64); // 32 bytes in hex = 64 characters
  });

  it('should consistently hash tokens using SHA-256', () => {
    const token = 'my_raw_refresh_token_12345';
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 = 32 bytes = 64 hex chars
    expect(hash1).not.toBe(token);
  });

  it('should sign and verify valid JWT access tokens with permissions context', () => {
    const payload = {
      userId: 'test-user-id',
      email: 'test@agency.com',
      workspaceId: 'test-ws-id',
      role: 'seo_manager',
      permissions: ['clients.view', 'websites.view'],
    };

    const token = signAccessToken(payload);
    expect(token).toBeDefined();

    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(payload.role);
    expect(decoded.permissions).toEqual(payload.permissions);
  });

  it('should reject invalid or tampered access tokens', () => {
    const token = signAccessToken({ userId: 'u1' });
    const tampered = token + 'tamper';

    expect(() => verifyAccessToken(tampered)).toThrow();
  });
});
