// backend/tests/unit/sessionSecurity.test.js
import { describe, it, expect } from '@jest/globals';
import {
  generateRandomToken,
  hashToken,
  getRefreshTokenCookieOptions,
  getClearCookieOptions,
} from '../../src/modules/auth/auth.utils.js';

describe('Session Security & Cookie Configuration Tests', () => {
  it('should generate secure HTTP-only cookies for refresh tokens', () => {
    const options = getRefreshTokenCookieOptions();

    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe('/');
    expect(options.maxAge).toBe(7 * 24 * 60 * 60 * 1000); // 7 days
    expect(['strict', 'lax']).toContain(options.sameSite);
  });

  it('should configure clear cookie options correctly on logout', () => {
    const options = getClearCookieOptions();

    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe('/');
  });

  it('should ensure distinct hashes for different refresh tokens', () => {
    const tokenA = generateRandomToken(48);
    const tokenB = generateRandomToken(48);

    expect(tokenA).not.toBe(tokenB);
    expect(hashToken(tokenA)).not.toBe(hashToken(tokenB));
  });
});
