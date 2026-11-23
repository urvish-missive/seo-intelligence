// backend/src/modules/ai/services/ai-guardrail.service.js
// Guardrail security layer: prompt injection protection, credential redaction, and token budgeting.

import logger from '../../../utils/logger.js';

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior)\s+instructions/i,
  /you\s+are\s+now\s+(DAN|unrestricted|jailbroken)/i,
  /system\s+override/i,
  /reveal\s+(your\s+)?(system\s+prompt|instructions|secret)/i,
  /print\s+(the\s+)?(system\s+prompt|credentials|api\s*key)/i,
  /bypass\s+(safety|guardrails|rbac|access\s*control)/i,
];

const BLOCKED_SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'refreshToken',
  'accessToken',
  'refreshTokenEnc',
  'accessTokenEnc',
  'credentialsEnc',
  'tokenHash',
  'secret',
  'apiKey',
  'api_key',
  'token',
  'ENCRYPTION_KEY',
  'clientSecret',
  'client_secret',
  'JWT_SECRET',
  'COOKIE_SECRET',
]);

export class AIGuardrailService {
  /**
   * Validate and sanitize incoming user query.
   * @param {string} input - User message text
   * @param {number} [maxLength=3000] - Character limit
   * @returns {{ isValid: boolean, sanitized: string, flag: string | null }}
   */
  validateInput(input, maxLength = 3000) {
    if (!input || typeof input !== 'string') {
      return { isValid: false, sanitized: '', flag: 'Empty input' };
    }

    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return { isValid: false, sanitized: '', flag: 'Empty input' };
    }

    if (trimmed.length > maxLength) {
      return {
        isValid: false,
        sanitized: trimmed.slice(0, maxLength),
        flag: `Input exceeds maximum allowed length of ${maxLength} characters.`,
      };
    }

    // Check for prompt injection attempts
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(trimmed)) {
        logger.warn('Potential prompt injection detected:', { pattern: pattern.toString() });
        return {
          isValid: true,
          sanitized: trimmed,
          flag: 'PROMPT_INJECTION_SUSPECTED',
        };
      }
    }

    return { isValid: true, sanitized: trimmed, flag: null };
  }

  /**
   * Deeply sanitize an object to strip credentials, hashes, and secrets.
   * @param {any} data
   * @returns {any}
   */
  sanitizeData(data) {
    if (!data || typeof data !== 'object') return data;

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      if (BLOCKED_SENSITIVE_KEYS.has(key)) {
        continue; // drop sensitive key entirely
      }

      if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Enforce approximate token budget on context object.
   * Rough rule: 4 characters ≈ 1 token.
   * @param {object} contextData
   * @param {number} [maxTokens=8000]
   * @returns {string} - JSON string within character limit
   */
  budgetContext(contextData, maxTokens = 8000) {
    const cleanData = this.sanitizeData(contextData);
    const jsonStr = JSON.stringify(cleanData, null, 2);
    const charBudget = maxTokens * 4;

    if (jsonStr.length <= charBudget) {
      return jsonStr;
    }

    // Truncate long arrays inside context
    const trimmed = { ...cleanData };

    if (Array.isArray(trimmed.topQueries) && trimmed.topQueries.length > 15) {
      trimmed.topQueries = trimmed.topQueries.slice(0, 15);
    }
    if (Array.isArray(trimmed.topPages) && trimmed.topPages.length > 15) {
      trimmed.topPages = trimmed.topPages.slice(0, 15);
    }
    if (Array.isArray(trimmed.findings) && trimmed.findings.length > 15) {
      trimmed.findings = trimmed.findings.slice(0, 15);
    }

    const reducedJson = JSON.stringify(trimmed, null, 2);
    if (reducedJson.length <= charBudget) {
      return reducedJson;
    }

    return reducedJson.slice(0, charBudget) + '\n... [Context truncated to adhere to token budget]';
  }
}

export const aiGuardrailService = new AIGuardrailService();
