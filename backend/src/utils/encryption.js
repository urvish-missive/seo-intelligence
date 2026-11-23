// backend/src/utils/encryption.js
// AES-256-GCM authenticated encryption at rest and secure HMAC OAuth state verification.

import crypto from 'node:crypto';
import { env } from '../config/environment.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes IV
const AUTH_TAG_LENGTH = 16; // 16 bytes Auth Tag

/**
 * Get the 32-byte binary key from hex environment variable.
 */
function getKeyBuffer() {
  const hexKey = env.ENCRYPTION_KEY;
  if (!hexKey || hexKey.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }
  return Buffer.from(hexKey, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Output format: "iv_hex:authTag_hex:ciphertext_hex"
 *
 * @param {string} plaintext
 * @returns {string} Encrypted string
 */
export function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) {
    return null;
  }

  const key = getKeyBuffer();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an AES-256-GCM encrypted string ("iv:authTag:ciphertext").
 *
 * @param {string} encryptedString
 * @returns {string} Plaintext string
 */
export function decrypt(encryptedString) {
  if (!encryptedString) {
    return null;
  }

  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format. Expected "iv:authTag:ciphertext".');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getKeyBuffer();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Generate a cryptographically signed OAuth state parameter containing
 * workspaceId, userId, nonce, and timestamp.
 *
 * @param {object} payload - { workspaceId, userId, returnUrl }
 * @returns {string} Base64URL-encoded state string
 */
export function generateOAuthState(payload) {
  const stateData = {
    ...payload,
    nonce: crypto.randomBytes(16).toString('hex'),
    createdAt: Date.now(),
  };

  const jsonString = JSON.stringify(stateData);
  const hmac = crypto.createHmac('sha256', getKeyBuffer());
  hmac.update(jsonString);
  const signature = hmac.digest('hex');

  const envelope = {
    data: jsonString,
    sig: signature,
  };

  return Buffer.from(JSON.stringify(envelope)).toString('base64url');
}

/**
 * Verify and decode an OAuth state parameter.
 * Enforces signature validity and 15-minute maximum lifetime.
 *
 * @param {string} stateString - Base64URL-encoded state string
 * @param {number} maxAgeMs - Maximum age in milliseconds (default 15 mins)
 * @returns {object} Decoded payload { workspaceId, userId, nonce, createdAt, ... }
 */
export function verifyOAuthState(stateString, maxAgeMs = 15 * 60 * 1000) {
  if (!stateString) {
    throw new Error('OAuth state parameter is missing.');
  }

  try {
    const raw = Buffer.from(stateString, 'base64url').toString('utf8');
    const envelope = JSON.parse(raw);

    if (!envelope.data || !envelope.sig) {
      throw new Error('Malformed OAuth state envelope.');
    }

    // Verify HMAC signature
    const hmac = crypto.createHmac('sha256', getKeyBuffer());
    hmac.update(envelope.data);
    const expectedSig = hmac.digest('hex');

    const sigBuf = Buffer.from(envelope.sig, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      throw new Error('OAuth state signature verification failed.');
    }

    const payload = JSON.parse(envelope.data);

    // Check expiration
    if (Date.now() - payload.createdAt > maxAgeMs) {
      throw new Error('OAuth state has expired. Please initiate authentication again.');
    }

    return payload;
  } catch (err) {
    throw new Error(`Invalid OAuth state: ${err.message}`);
  }
}

export default {
  encrypt,
  decrypt,
  generateOAuthState,
  verifyOAuthState,
};
