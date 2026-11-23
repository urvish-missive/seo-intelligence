// backend/src/modules/reports/utils/date-range.utils.js
// Date range utilities and equivalent prior comparison period calculations.

/**
 * Calculate previous equivalent comparison date range.
 * For example: if reporting period is 2026-10-01 to 2026-10-31 (31 days),
 * previous equivalent period is 2026-08-31 to 2026-09-30 (31 days).
 *
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {{ comparisonStart: string, comparisonEnd: string, durationDays: number }}
 */
export function calculateComparisonPeriod(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const durationMs = end.getTime() - start.getTime();
  const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24)) + 1;

  // Prior end is one day before start
  const compEnd = new Date(start.getTime() - (24 * 60 * 60 * 1000));
  const compStart = new Date(compEnd.getTime() - ((durationDays - 1) * 24 * 60 * 60 * 1000));

  return {
    comparisonStart: formatDateISO(compStart),
    comparisonEnd: formatDateISO(compEnd),
    durationDays,
  };
}

/**
 * Format Date to YYYY-MM-DD string.
 */
export function formatDateISO(date) {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

/**
 * Format date for human readability: "01 Nov 2026".
 */
export function formatDateHuman(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format a number with thousands separators.
 */
export function formatNumber(val) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return Number(val).toLocaleString('en-GB');
}

/**
 * Format percentage: e.g. 12.34%
 */
export function formatPercentage(val, decimals = 1) {
  if (val === null || val === undefined || isNaN(val)) return '0.0%';
  return `${Number(val).toFixed(decimals)}%`;
}

/**
 * Format average position / ranking: e.g. 4.2
 */
export function formatPosition(val) {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  return Number(val).toFixed(1);
}
