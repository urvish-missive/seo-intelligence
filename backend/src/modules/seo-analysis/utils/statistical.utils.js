// backend/src/modules/seo-analysis/utils/statistical.utils.js
// Statistical calculations for anomaly detection, percentage deltas, and moving averages.

/**
 * Calculate arithmetic mean.
 */
export function calculateMean(values = []) {
  if (!values.length) return 0;
  const sum = values.reduce((acc, v) => acc + (Number(v) || 0), 0);
  return sum / values.length;
}

/**
 * Calculate sample standard deviation.
 */
export function calculateStdDev(values = [], mean = null) {
  if (values.length < 2) return 0;
  const m = mean !== null ? mean : calculateMean(values);
  const variance =
    values.reduce((acc, v) => acc + Math.pow((Number(v) || 0) - m, 2), 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Calculate Z-score for an observed value against baseline mean and standard deviation.
 */
export function calculateZScore(value, mean, stdDev) {
  if (!stdDev || stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

/**
 * Calculate simple moving average (SMA) for an array of numbers with window size k.
 */
export function calculateSMA(values = [], k = 7) {
  if (values.length < k) return [];
  const sma = [];
  for (let i = k - 1; i < values.length; i++) {
    const window = values.slice(i - k + 1, i + 1);
    sma.push({
      index: i,
      value: calculateMean(window),
    });
  }
  return sma;
}

/**
 * Calculate percentage delta safely without division by zero.
 */
export function calculatePercentageDelta(current, previous) {
  const curr = typeof current === 'number' && !isNaN(current) ? current : 0;
  const prev = typeof previous === 'number' && !isNaN(previous) ? previous : 0;

  if (prev === 0 && curr === 0) return 0;
  if (prev === 0 && curr > 0) return 100.0;
  if (prev === 0 && curr < 0) return -100.0;

  return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
}

export default {
  calculateMean,
  calculateStdDev,
  calculateZScore,
  calculateSMA,
  calculatePercentageDelta,
};
