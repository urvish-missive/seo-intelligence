// backend/src/modules/seo-analysis/utils/fingerprint.utils.js
// Deterministic fingerprint generator for SEO findings.
// Ensures findings have stable unique keys to prevent duplicate creation across repeated runs.

import crypto from 'crypto';

/**
 * Generates a stable SHA256/MD5 fingerprint for an SEO finding.
 *
 * @param {string} websiteId
 * @param {string} ruleType - e.g. 'TRAFFIC_DROP', 'KEYWORD_OPPORTUNITY'
 * @param {string} affectedTarget - query string, URL path, or dimension name
 * @param {string} [subType=''] - optional sub-classifier
 * @returns {string} 32-character hex hash
 */
export function generateFindingFingerprint(websiteId, ruleType, affectedTarget = 'SITE', subType = '') {
  const normalizedTarget = String(affectedTarget).trim().toLowerCase();
  const rawKey = `${websiteId}:${ruleType}:${subType}:${normalizedTarget}`;
  return crypto.createHash('sha256').update(rawKey).digest('hex').substring(0, 32);
}

export default {
  generateFindingFingerprint,
};
