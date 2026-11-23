// backend/src/modules/reports/utils/formula-sanitizer.js
// Defense against Excel Formula Injection (CSV / Spreadsheet Formula Injection - CWE-1236).

const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Sanitize a value before writing to an Excel cell or CSV export.
 * If the value is a string starting with an executable formula character,
 * it is prefixed with a single quote (') to force spreadsheet applications
 * to treat it strictly as plaintext.
 *
 * @param {*} value - Cell value to sanitize
 * @returns {*} Sanitized safe value
 */
export function sanitizeCellValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  // Preserve numbers, booleans, and Date objects
  if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) {
    return value;
  }

  const str = String(value);
  if (str.length === 0) {
    return '';
  }

  // Check if string begins with any formula injection trigger character
  const firstChar = str.charAt(0);
  if (DANGEROUS_PREFIXES.includes(firstChar)) {
    return `'${str}`;
  }

  return str;
}

/**
 * Sanitize all string fields in a record or nested object.
 *
 * @param {object} record - Data row or object
 * @returns {object} Clean record
 */
export function sanitizeRecord(record) {
  if (!record || typeof record !== 'object') {
    return sanitizeCellValue(record);
  }

  if (Array.isArray(record)) {
    return record.map(item => sanitizeRecord(item));
  }

  const clean = {};
  for (const [key, val] of Object.entries(record)) {
    clean[key] = sanitizeRecord(val);
  }
  return clean;
}
