// backend/tests/unit/clarity-windows.test.js
// Clarity imports are rolling 1-3 day windows. Reports must pick them by their
// real window (not the import date) and never add up overlapping windows.
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { AnalyticsDataService } from '../../src/modules/analytics/analyticsData.service.js';
import prisma from '../../src/config/database.js';

const raw = (sessions, users, scroll) =>
  JSON.stringify([
    { metricName: 'Traffic', information: [{ totalSessionCount: String(sessions), totalBotSessionCount: '5', distinctUserCount: String(users), pagesPerSessionPercentage: 1.5 }] },
    { metricName: 'ScrollDepth', information: [{ averageScrollDepth: scroll }] },
    { metricName: 'EngagementTime', information: [{ totalTime: 120, activeTime: 30 }] },
    { metricName: 'QuickbackClick', information: [{ subTotal: 2 }] },
    { metricName: 'PopularPages', information: [{ url: 'https://example.com/', visitsCount: String(sessions) }] },
  ]);

const snap = (id, start, end, days, sessions, users, scroll) => ({
  id,
  windowStart: new Date(start),
  windowEnd: new Date(end),
  requestedNumOfDays: days,
  createdAt: new Date(end),
  rawResponseJson: raw(sessions, users, scroll),
});

describe('Clarity window totals', () => {
  afterEach(() => jest.restoreAllMocks());
  const svc = new AnalyticsDataService();

  it('uses the newest window and skips older windows that overlap it', async () => {
    // Newest first, as the query orders by windowEnd desc
    jest.spyOn(prisma.clarityImportSnapshot, 'findMany').mockResolvedValue([
      snap('new3d', '2026-11-22T10:39:00Z', '2026-11-25T10:39:00Z', 3, 59, 48, 32.61),
      snap('old3d', '2026-11-20T09:32:00Z', '2026-11-23T09:32:00Z', 3, 40, 30, 30),
      snap('old1d', '2026-11-22T09:32:00Z', '2026-11-23T09:32:00Z', 1, 18, 16, 35.4),
    ]);

    const t = await svc.getClarityWindowTotals('ws', 'web', { startDate: '2026-10-26', endDate: '2026-11-24' });
    expect(t.windows).toHaveLength(1);
    expect(t.sessions).toBe(59);
    expect(t.distinctUsers).toBe(48);
    expect(t.avgScrollDepth).toBe(32.61);
    expect(t.pagesPerSession).toBe(1.5);
    expect(t.avgTimeOnPageSec).toBe(30);
  });

  it('adds up back-to-back daily windows', async () => {
    jest.spyOn(prisma.clarityImportSnapshot, 'findMany').mockResolvedValue([
      snap('d3', '2026-11-24T02:00:00Z', '2026-11-25T02:00:00Z', 1, 20, 18, 40),
      snap('d2', '2026-11-23T02:00:00Z', '2026-11-24T02:00:00Z', 1, 10, 9, 10),
    ]);

    const t = await svc.getClarityWindowTotals('ws', 'web', { startDate: '2026-11-01', endDate: '2026-11-24' });
    expect(t.windows).toHaveLength(2);
    expect(t.sessions).toBe(30);
    expect(t.quickbackClickCount).toBe(4);
    expect(t.avgScrollDepth).toBe(30); // session-weighted: (20*40 + 10*10) / 30
    expect(t.pages[0]).toEqual({ page: 'https://example.com/', sessions: 30 });
  });

  it('matches imports by their window, not by the day they ran', async () => {
    const findMany = jest.spyOn(prisma.clarityImportSnapshot, 'findMany').mockResolvedValue([]);
    await svc.getClarityWindowTotals('ws', 'web', { startDate: '2026-10-26', endDate: '2026-11-24' });
    const where = findMany.mock.calls[0][0].where;
    expect(where.windowStart.lt.toISOString()).toBe('2026-11-25T00:00:00.000Z');
    expect(where.windowEnd.gt.toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });
});
