// ai-engine/src/context/contextBuilder.js
// Assembles structured SEO context from service data.
// Applies token budget limits to avoid exceeding model context window.

const DEFAULT_MAX_TOKENS = parseInt(process.env.OLLAMA_MAX_CONTEXT_TOKENS || '8000', 10);

/**
 * Build a structured context object from analytics data.
 * Strips any sensitive fields (tokens, credentials).
 *
 * @param {object} data - Raw data from backend services
 * @param {number} maxTokens - Approximate max tokens for context
 * @returns {string} - Serialised context string
 */
export function buildContextFromData(data, maxTokens = DEFAULT_MAX_TOKENS) {
  // Strip sensitive fields
  const sanitised = sanitiseData(data);

  // Serialise
  const full = JSON.stringify(sanitised, null, 2);

  // Rough token estimate: ~4 chars per token
  const estimatedTokens = Math.ceil(full.length / 4);

  if (estimatedTokens <= maxTokens) {
    return full;
  }

  // Apply truncation strategy if over budget
  return truncateContext(sanitised, maxTokens);
}

function sanitiseData(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const BLOCKED_KEYS = new Set([
    'password', 'passwordHash', 'refreshToken', 'accessToken',
    'refreshTokenEnc', 'accessTokenEnc', 'credentialsEnc',
    'tokenHash', 'secret', 'apiKey', 'token',
  ]);

  if (Array.isArray(obj)) {
    return obj.map(sanitiseData);
  }

  return Object.fromEntries(
    Object.entries(obj)
      .filter(([key]) => !BLOCKED_KEYS.has(key))
      .map(([key, val]) => [key, sanitiseData(val)])
  );
}

function truncateContext(data, maxTokens) {
  // Priority: keep summary stats, truncate long arrays
  const result = { ...data };
  const charBudget = maxTokens * 4;

  // Recursively truncate arrays to fit budget
  function trimArrays(obj, remainingBudget) {
    if (!obj || typeof obj !== 'object') return [obj, remainingBudget];
    if (Array.isArray(obj)) {
      const trimmed = [];
      let used = 2; // brackets
      for (const item of obj) {
        const itemStr = JSON.stringify(item);
        if (used + itemStr.length > remainingBudget) break;
        trimmed.push(item);
        used += itemStr.length + 1;
      }
      if (trimmed.length < obj.length) {
        trimmed.push({ _truncated: true, _omitted: obj.length - trimmed.length });
      }
      return [trimmed, remainingBudget - used];
    }
    const out = {};
    let rem = remainingBudget;
    for (const [key, val] of Object.entries(obj)) {
      const [trimmed, newRem] = trimArrays(val, rem);
      out[key] = trimmed;
      rem = newRem;
      if (rem <= 0) break;
    }
    return [out, rem];
  }

  const [trimmed] = trimArrays(result, charBudget);
  return JSON.stringify(trimmed, null, 2);
}
