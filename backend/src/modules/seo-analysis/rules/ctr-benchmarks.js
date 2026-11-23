// backend/src/modules/seo-analysis/rules/ctr-benchmarks.js
// Position-based expected organic CTR benchmark curve.
// Sourced from empirical organic search CTR distribution models.

export const POSITION_CTR_BENCHMARKS = [
  { minPos: 1.0, maxPos: 1.49, benchmarkCtr: 31.5 },
  { minPos: 1.5, maxPos: 2.49, benchmarkCtr: 16.0 },
  { minPos: 2.5, maxPos: 3.49, benchmarkCtr: 10.5 },
  { minPos: 3.5, maxPos: 4.49, benchmarkCtr: 7.2 },
  { minPos: 4.5, maxPos: 5.49, benchmarkCtr: 5.8 },
  { minPos: 5.5, maxPos: 6.49, benchmarkCtr: 4.5 },
  { minPos: 6.5, maxPos: 7.49, benchmarkCtr: 3.6 },
  { minPos: 7.5, maxPos: 8.49, benchmarkCtr: 3.0 },
  { minPos: 8.5, maxPos: 9.49, benchmarkCtr: 2.5 },
  { minPos: 9.5, maxPos: 10.49, benchmarkCtr: 2.1 },
  { minPos: 10.5, maxPos: 15.49, benchmarkCtr: 1.4 },
  { minPos: 15.5, maxPos: 20.49, benchmarkCtr: 0.9 },
  { minPos: 20.5, maxPos: 50.0, benchmarkCtr: 0.4 },
];

/**
 * Returns expected CTR percentage for a given average position.
 * @param {number} position - e.g. 2.3 or 11.4
 * @returns {number} Expected benchmark CTR in percentage points (e.g. 16.0)
 */
export function getBenchmarkCtrForPosition(position) {
  if (typeof position !== 'number' || isNaN(position) || position < 1) {
    return 0.5;
  }
  const match = POSITION_CTR_BENCHMARKS.find(
    (b) => position >= b.minPos && position <= b.maxPos
  );
  if (match) return match.benchmarkCtr;
  return position > 50 ? 0.2 : 0.5;
}

export default {
  POSITION_CTR_BENCHMARKS,
  getBenchmarkCtrForPosition,
};
