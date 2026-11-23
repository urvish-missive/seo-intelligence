// backend/tests/unit/encryption.test.js
import { describe, it, expect } from '@jest/globals';
import {
  encrypt,
  decrypt,
  generateOAuthState,
  verifyOAuthState,
} from '../../src/utils/encryption.js';

describe('Encryption Utility (AES-256-GCM)', () => {
  it('should encrypt and decrypt strings successfully', () => {
    const secretText = 'ya29.a0ARrdaM-sensitive-google-refresh-token-123456';
    const encrypted = encrypt(secretText);

    expect(encrypted).toBeDefined();
    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toEqual(secretText);

    const parts = encrypted.split(':');
    expect(parts.length).toBe(3); // iv:authTag:ciphertext

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(secretText);
  });

  it('should return null when encrypting null or undefined', () => {
    expect(encrypt(null)).toBeNull();
    expect(encrypt(undefined)).toBeNull();
    expect(decrypt(null)).toBeNull();
    expect(decrypt('')).toBeNull();
  });

  it('should fail decryption if ciphertext is tampered with', () => {
    const secretText = 'sensitive-token-to-tamper';
    const encrypted = encrypt(secretText);
    const [iv, authTag, ciphertext] = encrypted.split(':');

    // Corrupt ciphertext
    const tamperedCiphertext = ciphertext.slice(0, -2) + (ciphertext.endsWith('0') ? '1' : '0');
    const tamperedPayload = `${iv}:${authTag}:${tamperedCiphertext}`;

    expect(() => decrypt(tamperedPayload)).toThrow();
  });

  it('should fail decryption if authTag is tampered with', () => {
    const secretText = 'sensitive-token-to-tamper';
    const encrypted = encrypt(secretText);
    const [iv, authTag, ciphertext] = encrypted.split(':');

    // Corrupt authTag
    const tamperedAuthTag = authTag.slice(0, -2) + 'ff';
    const tamperedPayload = `${iv}:${tamperedAuthTag}:${ciphertext}`;

    expect(() => decrypt(tamperedPayload)).toThrow();
  });
});

describe('OAuth State Cryptographic Nonce & Verification', () => {
  it('should generate and verify valid state', () => {
    const payload = {
      workspaceId: 'ws-123',
      userId: 'user-456',
    };

    const state = generateOAuthState(payload);
    expect(state).toBeDefined();
    expect(typeof state).toBe('string');

    const verified = verifyOAuthState(state);
    expect(verified.workspaceId).toBe('ws-123');
    expect(verified.userId).toBe('user-456');
    expect(verified.nonce).toBeDefined();
    expect(verified.createdAt).toBeDefined();
  });

  it('should reject tampered state string', () => {
    const payload = { workspaceId: 'ws-123', userId: 'user-456' };
    const state = generateOAuthState(payload);

    // Tamper with base64 payload
    const tampered = state.slice(0, -4) + 'abcd';
    expect(() => verifyOAuthState(tampered)).toThrow();
  });

  it('should reject expired state token', async () => {
    const payload = { workspaceId: 'ws-123', userId: 'user-456' };
    const state = generateOAuthState(payload);

    // Verify with 0ms max age
    expect(() => verifyOAuthState(state, -1)).toThrow(/expired/);
  });
});
