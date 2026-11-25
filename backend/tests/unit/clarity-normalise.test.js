// backend/tests/unit/clarity-normalise.test.js
// Regression tests: Clarity Data Export responses use `information` rows, string counts,
// `distantUserCount` / `PagesPerSessionPercentage`, and dimension values keyed by dimension name.
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  ClarityImportService,
  pick,
  groupRows,
  findGroup,
} from '../../src/modules/integrations/clarity/clarityImport.service.js';
import { getEffectiveCallsToday } from '../../src/modules/integrations/clarity/clarityConnection.service.js';
import prisma from '../../src/config/database.js';

const overviewResponse = [
  {
    metricName: 'Traffic',
    information: [
      { totalSessionCount: '1200', totalBotSessionCount: '40', distantUserCount: '900', PagesPerSessionPercentage: 2.5 },
    ],
  },
  { metricName: 'DeadClickCount', information: [{ sessionsCount: '60', subTotal: '75' }] },
  { metricName: 'RageClickCount', information: [{ sessionsCount: '10', subTotal: '12' }] },
  { metricName: 'QuickbackClick', information: [{ sessionsCount: '30', subTotal: '33' }] },
  { metricName: 'ScrollDepth', information: [{ averageScrollDepth: 55.5 }] },
  { metricName: 'EngagementTime', information: [{ totalTime: '120', activeTime: '45' }] },
  { metricName: 'Device', information: [{ name: 'PC', sessionsCount: '700' }, { name: 'Mobile', sessionsCount: '500' }] },
  { metricName: 'Country/Region', information: [{ name: 'India', sessionsCount: '800' }] },
  { metricName: 'PopularPages', information: [{ url: 'https://example.com/', visitsCount: '400' }] },
];

describe('Clarity response normalisation', () => {
  let upserts;

  beforeEach(() => {
    upserts = { daily: [], device: [], country: [], page: [] };
    jest.spyOn(prisma.clarityDailyMetric, 'upsert').mockImplementation((args) => { upserts.daily.push(args); return args; });
    jest.spyOn(prisma.clarityDeviceMetric, 'upsert').mockImplementation((args) => { upserts.device.push(args); return args; });
    jest.spyOn(prisma.clarityCountryMetric, 'upsert').mockImplementation((args) => { upserts.country.push(args); return args; });
    jest.spyOn(prisma.clarityPageMetric, 'upsert').mockImplementation((args) => { upserts.page.push(args); return args; });
    jest.spyOn(prisma, '$transaction').mockResolvedValue([]);
    jest.spyOn(prisma.clarityDimensionMetric, 'deleteMany').mockResolvedValue({ count: 0 });
    jest.spyOn(prisma.clarityDimensionMetric, 'createMany').mockResolvedValue({ count: 0 });
  });

  afterEach(() => jest.restoreAllMocks());

  it('helpers read the documented field names', () => {
    const row = overviewResponse[0].information[0];
    expect(Number(pick(row, 'distinctUserCount', 'distantUserCount'))).toBe(900);
    expect(pick(row, 'pagesPerSessionPercentage')).toBe(2.5);
    expect(groupRows(overviewResponse[1])).toHaveLength(1);
    expect(findGroup(overviewResponse, 'Country', 'Country/Region')).toBe(overviewResponse[7]);
    expect(findGroup(overviewResponse, 'deadclickcount')).toBe(overviewResponse[1]);
  });

  it('OVERVIEW stores real sessions, users and friction counts', async () => {
    const svc = new ClarityImportService();
    await svc.normaliseAndPersist({
      websiteId: 'w1', dateStr: '2026-11-25', snapshotId: 's1', preset: 'OVERVIEW', dimensions: [], data: overviewResponse,
    });

    const daily = upserts.daily[0].create;
    expect(daily.sessions).toBe(1200);
    expect(daily.distinctUsers).toBe(900);
    expect(daily.botSessions).toBe(40);
    expect(daily.pagesPerSession).toBe(2.5);
    expect(daily.deadClickCount).toBe(75);
    expect(daily.rageClickCount).toBe(12);
    expect(daily.quickbackClickCount).toBe(33);
    expect(daily.avgScrollDepth).toBe(55.5);
    expect(daily.avgTimeOnPageSec).toBe(45);

    expect(upserts.device.map((u) => u.create.device)).toEqual(['pc', 'mobile']);
    expect(upserts.country[0].create).toMatchObject({ country: 'India', sessions: 800 });
    expect(upserts.page[0].create).toMatchObject({ page: 'https://example.com/', sessions: 400 });
  });

  it('DEVICE preset splits Traffic by the "Device" key instead of collapsing into one row', async () => {
    const svc = new ClarityImportService();
    await svc.normaliseAndPersist({
      websiteId: 'w1', dateStr: '2026-11-25', snapshotId: 's1', preset: 'DEVICE', dimensions: ['Device'],
      data: [{
        metricName: 'Traffic',
        information: [
          { totalSessionCount: '700', PagesPerSessionPercentage: 3, Device: 'PC' },
          { totalSessionCount: '500', PagesPerSessionPercentage: 1.5, Device: 'Mobile' },
        ],
      }],
    });

    expect(upserts.device).toHaveLength(2);
    expect(upserts.device[0].create).toMatchObject({ device: 'pc', sessions: 700, pagesPerSession: 3 });
    expect(upserts.device[1].create).toMatchObject({ device: 'mobile', sessions: 500 });
  });

  it('URL preset merges friction metrics per page', async () => {
    const svc = new ClarityImportService();
    const url = 'https://example.com/pricing';
    await svc.normaliseAndPersist({
      websiteId: 'w1', dateStr: '2026-11-25', snapshotId: 's1', preset: 'URL', dimensions: ['URL'],
      data: [
        { metricName: 'Traffic', information: [{ totalSessionCount: '300', URL: url }] },
        { metricName: 'DeadClickCount', information: [{ subTotal: '9', URL: url }] },
        { metricName: 'RageClickCount', information: [{ subTotal: '4', URL: url }] },
        { metricName: 'ScrollDepth', information: [{ averageScrollDepth: 40, URL: url }] },
      ],
    });

    expect(upserts.page).toHaveLength(1);
    expect(upserts.page[0].create).toMatchObject({ page: url, sessions: 300, deadClicks: 9, rageClicks: 4, avgScrollDepth: 40 });
  });
});

describe('Clarity daily quota rollover', () => {
  it('treats a counter from a previous UTC day as 0', () => {
    const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000);
    expect(getEffectiveCallsToday({ apiCallsToday: 10, apiCallsResetAt: yesterday })).toBe(0);
    expect(getEffectiveCallsToday({ apiCallsToday: 10, apiCallsResetAt: null })).toBe(0);
    expect(getEffectiveCallsToday({ apiCallsToday: 4, apiCallsResetAt: new Date() })).toBe(4);
  });
});
