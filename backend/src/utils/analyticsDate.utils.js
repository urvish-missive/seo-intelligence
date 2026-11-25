// backend/src/utils/analyticsDate.utils.js
// Date range calculations and comparison metrics for SEO Analytics.

/**
 * Parses YYYY-MM-DD string into a UTC Date object.
 */
export function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Formats a Date object as YYYY-MM-DD.
 */
export function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Given a current date range [startDate, endDate], returns:
 * - current: { startDate, endDate, daysCount }
 * - previous: { startDate, endDate, daysCount } (exact preceding equivalent duration)
 */
export function getComparisonDateRanges(startDate, endDate) {
  const currentStart = parseDate(startDate);
  const currentEnd = parseDate(endDate);

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysCount = Math.round((currentEnd.getTime() - currentStart.getTime()) / msPerDay) + 1;

  if (daysCount <= 0) {
    throw new Error('startDate must be before or equal to endDate');
  }

  // Preceding period ends the day before currentStart
  const prevEnd = new Date(currentStart.getTime() - msPerDay);
  const prevStart = new Date(prevEnd.getTime() - (daysCount - 1) * msPerDay);

  return {
    current: {
      startDate: formatDate(currentStart),
      endDate: formatDate(currentEnd),
      daysCount,
    },
    previous: {
      startDate: formatDate(prevStart),
      endDate: formatDate(prevEnd),
      daysCount,
    },
  };
}

/**
 * Calculate absolute and percentage change between two values.
 *
 * @param {number} current
 * @param {number} previous
 * @param {object} options
 * @param {boolean} options.inverseTrend - If true (e.g. bounce rate, position), lower is better.
 * @param {number} options.decimals - Precision of percentage.
 */
export function calculateComparisonMetric(current, previous, { inverseTrend = false, decimals = 1 } = {}) {
  const curr = typeof current === 'number' && !isNaN(current) ? current : 0;
  const prev = typeof previous === 'number' && !isNaN(previous) ? previous : 0;

  const absoluteChange = parseFloat((curr - prev).toFixed(decimals + 1));

  let percentChange = null;
  let status = 'neutral';

  if (prev > 0) {
    percentChange = parseFloat((((curr - prev) / prev) * 100).toFixed(decimals));
  } else if (prev === 0 && curr > 0) {
    percentChange = 100; // New emergence
  } else if (prev === 0 && curr === 0) {
    percentChange = 0;
  }

  if (absoluteChange > 0) {
    status = inverseTrend ? 'negative' : 'positive';
  } else if (absoluteChange < 0) {
    status = inverseTrend ? 'positive' : 'negative';
  }

  return {
    current: curr,
    previous: prev,
    absoluteChange,
    percentChange,
    percentage: percentChange, // alias read by the dashboard KPI cards
    status, // 'positive' | 'negative' | 'neutral'
    trend: absoluteChange > 0 ? 'up' : absoluteChange < 0 ? 'down' : 'flat',
  };
}

export default {
  parseDate,
  formatDate,
  getComparisonDateRanges,
  calculateComparisonMetric,
};
