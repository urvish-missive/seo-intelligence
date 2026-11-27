// backend/src/modules/analytics/insights.service.js
// Data for the Insights page: new vs returning visitors, form funnel, AI
// visitors, channel trends and page-by-page performance with suggestions.
//
// GA4 numbers are queried live from the GA4 Data API (cached for an hour)
// because the stored daily tables don't hold these breakdowns and only go
// back to the first sync. Search Console and Clarity come from stored rows.

import prisma from '../../config/database.js';
import { BadRequestError, NotFoundError } from '../../middleware/errorHandler.js';
import GoogleClientFactory from '../integrations/google/googleClient.factory.js';
import logger from '../../utils/logger.js';

const CACHE_TTL_MS = 60 * 60 * 1000;
const GA4_TIMEOUT_MS = 25000;
const cache = new Map();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Referrers that are AI assistants / AI search, matched on GA4 sessionSource. */
const AI_SOURCES = [
  { name: 'ChatGPT', re: /chatgpt|openai/i },
  { name: 'Perplexity', re: /perplexity/i },
  { name: 'Claude', re: /claude\.ai|anthropic/i },
  { name: 'Gemini', re: /gemini|bard\.google/i },
  { name: 'Copilot', re: /copilot|bing\.com\/chat/i },
  { name: 'Google AI (Vertex)', re: /vertexaisearch/i },
  { name: 'DeepSeek', re: /deepseek/i },
  { name: 'Meta AI', re: /meta\.ai/i },
  { name: 'Grok', re: /grok|x\.ai/i },
  { name: 'You.com', re: /you\.com/i },
  { name: 'Mistral', re: /mistral|chat\.mistral/i },
];
const AI_SOURCE_REGEX = 'chatgpt|openai|perplexity|claude\\.ai|anthropic|gemini|bard\\.google|copilot|vertexaisearch|deepseek|meta\\.ai|grok|x\\.ai|you\\.com|mistral';

const FORM_EVENTS = ['form_start', 'form_submit', 'generate_lead', 'Contact_Thank_You'];

function pad(n) {
  return String(n).padStart(2, '0');
}
function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function round(v, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
function aiPlatform(source) {
  return AI_SOURCES.find((s) => s.re.test(source || ''))?.name || null;
}
function ymFromGA4(raw) {
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}`;
}

/** Normalise a full URL or a GA4 path to "/path" so the three tools line up. */
export function normalisePath(urlOrPath) {
  if (!urlOrPath || urlOrPath === '(not set)') return null;
  let path = String(urlOrPath).trim();
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {
    /* keep as is */
  }
  path = path.split('?')[0].split('#')[0].toLowerCase();
  path = path.replace(/\/{2,}/g, '/');
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

/** Simple least-squares slope as a % of the series mean, per month. */
function trendPercentPerMonth(values) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v !== null);
  if (pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((a, [x]) => a + x, 0) / n;
  const my = pts.reduce((a, [, y]) => a + y, 0) / n;
  if (my === 0) return null;
  const num = pts.reduce((a, [x, y]) => a + (x - mx) * (y - my), 0);
  const den = pts.reduce((a, [x]) => a + (x - mx) ** 2, 0);
  return den ? ((num / den) / my) * 100 : null;
}

export class InsightsService {
  // ─── Shared helpers ──────────────────────────────────────────────────────

  async resolveContext(workspaceId, websiteId, { startDate, endDate } = {}) {
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
      select: { id: true, name: true, domain: true },
    });
    if (!website) throw new NotFoundError('Website not found in this workspace.');

    const y = new Date();
    y.setDate(y.getDate() - 1);
    const end = endDate || ymd(y);
    const start = startDate || ymd(new Date(y.getFullYear(), y.getMonth() - 11, 1));
    if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) {
      throw new BadRequestError('startDate and endDate must be YYYY-MM-DD with startDate on or before endDate.');
    }
    return { website, startDate: start, endDate: end };
  }

  /** Runs a GA4 report (cached). Returns rows as plain objects, or throws a readable error. */
  async ga4(workspaceId, websiteId, startDate, endDate, { dimensions = [], metrics, filter, limit = 10000, orderBys }) {
    const key = JSON.stringify([websiteId, startDate, endDate, dimensions, metrics, filter, limit, orderBys]);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;

    const promise = (async () => {
      const connection = await prisma.integrationConnection.findFirst({
        where: { websiteId, workspaceId, integrationType: 'GA4' },
        include: { googleAccount: true },
      });
      if (!connection?.googleAccount || !connection.selectedProperty) {
        throw new BadRequestError('GA4 is not connected for this website.');
      }
      if (connection.googleAccount.status !== 'CONNECTED') {
        throw new BadRequestError('The Google account for GA4 needs to be reconnected.');
      }
      const property = connection.selectedProperty.startsWith('properties/')
        ? connection.selectedProperty
        : `properties/${connection.selectedProperty}`;

      const requestBody = {
        dateRanges: [{ startDate, endDate }],
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        limit,
        ...(filter ? { dimensionFilter: filter } : {}),
        ...(orderBys ? { orderBys } : {}),
      };
      const client = await GoogleClientFactory.getAnalyticsDataClient(connection.googleAccount);

      let timer;
      const res = await Promise.race([
        client.properties.runReport({ property, requestBody }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('GA4 took too long to respond. Try again in a moment.')), GA4_TIMEOUT_MS);
        }),
      ]).finally(() => clearTimeout(timer));

      return (res.data?.rows || []).map((r) => {
        const row = {};
        dimensions.forEach((d, i) => {
          row[d] = r.dimensionValues[i].value;
        });
        metrics.forEach((m, i) => {
          row[m] = Number(r.metricValues[i].value) || 0;
        });
        return row;
      });
    })();

    cache.set(key, { at: Date.now(), promise });
    promise.catch((err) => {
      cache.delete(key);
      logger.warn(`Insights GA4 query failed for website ${websiteId}: ${err.message}`);
    });
    return promise;
  }

  // ─── 1. New vs returning ─────────────────────────────────────────────────

  async getVisitors(workspaceId, websiteId, range) {
    const ctx = await this.resolveContext(workspaceId, websiteId, range);
    const q = (dims) =>
      this.ga4(workspaceId, websiteId, ctx.startDate, ctx.endDate, {
        dimensions: dims,
        metrics: ['totalUsers', 'sessions', 'engagedSessions', 'userEngagementDuration', 'screenPageViews', 'keyEvents'],
      });
    const [totals, monthly] = await Promise.all([q(['newVsReturning']), q(['yearMonth', 'newVsReturning'])]);

    const shape = (r) => ({
      users: r.totalUsers,
      sessions: r.sessions,
      engagementRate: r.sessions ? round((r.engagedSessions / r.sessions) * 100) : 0,
      avgEngagementTimeSec: r.totalUsers ? round(r.userEngagementDuration / r.totalUsers, 0) : 0,
      pagesPerSession: r.sessions ? round(r.screenPageViews / r.sessions) : 0,
      keyEvents: r.keyEvents,
      keyEventRate: r.sessions ? round((r.keyEvents / r.sessions) * 100) : 0,
    });
    const byType = Object.fromEntries(totals.filter((r) => r.newVsReturning === 'new' || r.newVsReturning === 'returning').map((r) => [r.newVsReturning, shape(r)]));
    const newU = byType.new?.users || 0;
    const retU = byType.returning?.users || 0;

    const months = new Map();
    for (const r of monthly) {
      if (r.newVsReturning !== 'new' && r.newVsReturning !== 'returning') continue;
      const ym = ymFromGA4(r.yearMonth);
      if (!months.has(ym)) months.set(ym, { month: ym, new: 0, returning: 0 });
      months.get(ym)[r.newVsReturning] = r.totalUsers;
    }

    return {
      ...ctx,
      new: byType.new || shape({}),
      returning: byType.returning || shape({}),
      returningShare: newU + retU ? round((retU / (newU + retU)) * 100, 1) : 0,
      monthly: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
      note: 'A returning user has visited before on the same browser and device. The same person on a new device counts as new.',
    };
  }

  // ─── 2. Form funnel ──────────────────────────────────────────────────────

  async getForms(workspaceId, websiteId, range) {
    const ctx = await this.resolveContext(workspaceId, websiteId, range);
    const filter = { filter: { fieldName: 'eventName', inListFilter: { values: FORM_EVENTS } } };
    const [byPage, monthly, viewsByPage] = await Promise.all([
      this.ga4(workspaceId, websiteId, ctx.startDate, ctx.endDate, {
        dimensions: ['eventName', 'pagePath'],
        metrics: ['eventCount', 'totalUsers'],
        filter,
      }),
      this.ga4(workspaceId, websiteId, ctx.startDate, ctx.endDate, {
        dimensions: ['yearMonth', 'eventName'],
        metrics: ['eventCount'],
        filter,
      }),
      this.ga4(workspaceId, websiteId, ctx.startDate, ctx.endDate, {
        dimensions: ['pagePath'],
        metrics: ['screenPageViews', 'totalUsers'],
      }),
    ]);

    const views = new Map(viewsByPage.map((r) => [normalisePath(r.pagePath), r]));
    const pages = new Map();
    const totals = { form_start: 0, form_submit: 0, generate_lead: 0, Contact_Thank_You: 0 };
    const usersStarted = { total: 0 };
    for (const r of byPage) {
      const path = normalisePath(r.pagePath);
      if (!path) continue;
      totals[r.eventName] = (totals[r.eventName] || 0) + r.eventCount;
      if (r.eventName === 'form_start') usersStarted.total += r.totalUsers;
      if (!pages.has(path)) {
        pages.set(path, { path, views: views.get(path)?.screenPageViews || 0, started: 0, startedUsers: 0, submitted: 0, thankYou: 0, leads: 0 });
      }
      const p = pages.get(path);
      if (r.eventName === 'form_start') {
        p.started += r.eventCount;
        p.startedUsers += r.totalUsers;
      } else if (r.eventName === 'form_submit') p.submitted += r.eventCount;
      else if (r.eventName === 'generate_lead') p.leads += r.eventCount;
      else if (r.eventName === 'Contact_Thank_You') p.thankYou += r.eventCount;
    }

    const pageRows = [...pages.values()]
      .map((p) => ({
        ...p,
        startRate: p.views ? round((p.started / p.views) * 100, 1) : null,
        completionRate: p.started ? round((p.submitted / p.started) * 100, 1) : null,
      }))
      .sort((a, b) => b.started + b.submitted + b.thankYou - (a.started + a.submitted + a.thankYou));

    const months = new Map();
    for (const r of monthly) {
      const ym = ymFromGA4(r.yearMonth);
      if (!months.has(ym)) months.set(ym, { month: ym, form_start: 0, form_submit: 0, generate_lead: 0, Contact_Thank_You: 0 });
      months.get(ym)[r.eventName] = r.eventCount;
    }

    return {
      ...ctx,
      tracking: {
        formStart: totals.form_start > 0,
        formSubmit: totals.form_submit > 0,
        thankYouEvent: totals.Contact_Thank_You > 0,
      },
      totals: {
        started: totals.form_start,
        startedUsers: usersStarted.total,
        submitted: totals.form_submit,
        thankYou: totals.Contact_Thank_You,
        leads: totals.generate_lead,
        abandonRate: totals.form_start ? round(((totals.form_start - totals.form_submit) / totals.form_start) * 100, 1) : null,
      },
      pages: pageRows.slice(0, 50),
      monthly: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    };
  }

  // ─── 3. AI visitors ──────────────────────────────────────────────────────

  async getAiVisitors(workspaceId, websiteId, range) {
    const ctx = await this.resolveContext(workspaceId, websiteId, range);
    const filter = {
      filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'PARTIAL_REGEXP', value: AI_SOURCE_REGEX, caseSensitive: false } },
    };
    const metrics = ['sessions', 'totalUsers', 'engagedSessions', 'keyEvents'];
    const [bySource, monthly, byPage, allSessions] = await Promise.all([
      this.ga4(workspaceId, websiteId, ctx.startDate, ctx.endDate, { dimensions: ['sessionSource'], metrics, filter }),
      this.ga4(workspaceId, websiteId, ctx.startDate, ctx.endDate, { dimensions: ['yearMonth', 'sessionSource'], metrics: ['sessions'], filter }),
      this.ga4(workspaceId, websiteId, ctx.startDate, ctx.endDate, { dimensions: ['landingPage', 'sessionSource'], metrics, filter }),
      this.ga4(workspaceId, websiteId, ctx.startDate, ctx.endDate, { metrics: ['sessions'] }),
    ]);

    const platforms = new Map();
    for (const r of bySource) {
      const name = aiPlatform(r.sessionSource);
      if (!name) continue;
      if (!platforms.has(name)) platforms.set(name, { platform: name, sessions: 0, users: 0, engagedSessions: 0, keyEvents: 0 });
      const p = platforms.get(name);
      p.sessions += r.sessions;
      p.users += r.totalUsers;
      p.engagedSessions += r.engagedSessions;
      p.keyEvents += r.keyEvents;
    }
    const platformRows = [...platforms.values()]
      .map((p) => ({ ...p, engagementRate: p.sessions ? round((p.engagedSessions / p.sessions) * 100, 1) : 0 }))
      .sort((a, b) => b.sessions - a.sessions);

    const months = new Map();
    for (const r of monthly) {
      const name = aiPlatform(r.sessionSource);
      if (!name) continue;
      const ym = ymFromGA4(r.yearMonth);
      if (!months.has(ym)) months.set(ym, { month: ym, total: 0 });
      const m = months.get(ym);
      m[name] = (m[name] || 0) + r.sessions;
      m.total += r.sessions;
    }

    const pages = new Map();
    for (const r of byPage) {
      const name = aiPlatform(r.sessionSource);
      const path = normalisePath(r.landingPage);
      if (!name || !path) continue;
      if (!pages.has(path)) pages.set(path, { path, sessions: 0, engagedSessions: 0, platforms: {} });
      const p = pages.get(path);
      p.sessions += r.sessions;
      p.engagedSessions += r.engagedSessions;
      p.platforms[name] = (p.platforms[name] || 0) + r.sessions;
    }

    const totalSessions = platformRows.reduce((a, p) => a + p.sessions, 0);
    const siteSessions = allSessions[0]?.sessions || 0;
    return {
      ...ctx,
      totals: {
        sessions: totalSessions,
        users: platformRows.reduce((a, p) => a + p.users, 0),
        keyEvents: platformRows.reduce((a, p) => a + p.keyEvents, 0),
        shareOfAllSessions: siteSessions ? round((totalSessions / siteSessions) * 100, 2) : 0,
        engagementRate: totalSessions
          ? round((platformRows.reduce((a, p) => a + p.engagedSessions, 0) / totalSessions) * 100, 1)
          : 0,
      },
      platforms: platformRows,
      platformNames: platformRows.map((p) => p.platform),
      monthly: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
      pages: [...pages.values()]
        .map((p) => ({ ...p, engagementRate: p.sessions ? round((p.engagedSessions / p.sessions) * 100, 1) : 0 }))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 25),
    };
  }

  // ─── 4. Channel trends ───────────────────────────────────────────────────

  async getChannels(workspaceId, websiteId, range) {
    const ctx = await this.resolveContext(workspaceId, websiteId, range);
    const rows = await this.ga4(workspaceId, websiteId, ctx.startDate, ctx.endDate, {
      dimensions: ['yearMonth', 'sessionDefaultChannelGroup'],
      metrics: ['sessions', 'engagedSessions', 'keyEvents', 'totalUsers'],
    });

    const monthsSet = new Set(rows.map((r) => ymFromGA4(r.yearMonth)));
    const months = [...monthsSet].sort();
    // The last month is usually incomplete: leave it out of trend maths
    const currentMonth = ymd(new Date()).slice(0, 7);
    const endMonth = ctx.endDate.slice(0, 7);
    const endIsFullMonth = Number(ctx.endDate.slice(8)) === new Date(Number(endMonth.slice(0, 4)), Number(endMonth.slice(5)), 0).getDate();
    const completeMonths = months.filter((m) => !(m === endMonth && (!endIsFullMonth || m === currentMonth)));

    const channels = new Map();
    for (const r of rows) {
      const ch = r.sessionDefaultChannelGroup || 'Unassigned';
      if (!channels.has(ch)) channels.set(ch, { channel: ch, byMonth: {}, sessions: 0, engagedSessions: 0, keyEvents: 0, users: 0 });
      const c = channels.get(ch);
      const ym = ymFromGA4(r.yearMonth);
      c.byMonth[ym] = (c.byMonth[ym] || 0) + r.sessions;
      c.sessions += r.sessions;
      c.engagedSessions += r.engagedSessions;
      c.keyEvents += r.keyEvents;
      c.users += r.totalUsers;
    }
    const siteSessions = [...channels.values()].reduce((a, c) => a + c.sessions, 0);

    const sum = (c, ms) => ms.reduce((a, m) => a + (c.byMonth[m] || 0), 0);
    const recent = completeMonths.slice(-3);
    const prior = completeMonths.slice(-6, -3);

    const out = [...channels.values()].map((c) => {
      const series = months.map((m) => ({ month: m, sessions: c.byMonth[m] || 0, partial: !completeMonths.includes(m) }));
      const recentSum = sum(c, recent);
      const priorSum = sum(c, prior);
      // Compare monthly averages, so a shorter "before" window (e.g. 6-month
      // view → only 2 earlier months) doesn't inflate growth
      const recentAvg = recent.length ? recentSum / recent.length : 0;
      const priorAvg = prior.length ? priorSum / prior.length : 0;
      const change = priorAvg ? ((recentAvg - priorAvg) / priorAvg) * 100 : recentAvg > 0 ? null : 0;
      const slope = trendPercentPerMonth(completeMonths.map((m) => c.byMonth[m] || 0));
      const lastFull = completeMonths[completeMonths.length - 1];
      const prevFull = completeMonths[completeMonths.length - 2];

      let status = 'stable';
      if (recentSum + priorSum < 15) status = 'too_little_data';
      else if (priorSum === 0 && recentSum > 0) status = 'new';
      else if (change >= 15) status = 'growing';
      else if (change <= -15) status = 'declining';

      // Spike / drop in the latest full month vs the average of the 3 before it
      const before = completeMonths.slice(-4, -1).map((m) => c.byMonth[m] || 0);
      const avgBefore = before.length ? before.reduce((a, v) => a + v, 0) / before.length : 0;
      const lastVal = c.byMonth[lastFull] || 0;
      let anomaly = null;
      if (avgBefore >= 10 && lastVal >= avgBefore * 1.8) anomaly = 'spike';
      else if (avgBefore >= 10 && lastVal <= avgBefore * 0.5) anomaly = 'drop';

      return {
        channel: c.channel,
        sessions: c.sessions,
        users: c.users,
        share: siteSessions ? round((c.sessions / siteSessions) * 100, 1) : 0,
        engagementRate: c.sessions ? round((c.engagedSessions / c.sessions) * 100, 1) : 0,
        keyEvents: c.keyEvents,
        keyEventRate: c.sessions ? round((c.keyEvents / c.sessions) * 100, 2) : 0,
        recent3: recentSum,
        prior3: priorSum,
        recentAvg: Math.round(recentAvg),
        priorAvg: Math.round(priorAvg),
        change3m: round(change, 1),
        trendPerMonth: round(slope, 1),
        lastMonth: lastFull ? { month: lastFull, sessions: lastVal, typicalBefore: Math.round(avgBefore), vsPrev: prevFull ? round(((lastVal - (c.byMonth[prevFull] || 0)) / Math.max(1, c.byMonth[prevFull] || 0)) * 100, 1) : null } : null,
        status,
        anomaly,
        series,
      };
    });
    out.sort((a, b) => b.sessions - a.sessions);

    return {
      ...ctx,
      months,
      comparedPeriods: { recent, prior },
      channels: out,
      patterns: this.describeChannelPatterns(out, recent, prior),
    };
  }

  /** Plain-language observations about channel movement. */
  describeChannelPatterns(channels, recent, prior) {
    const notes = [];
    const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const nice = (ym) => `${M[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
    const label = (ms) => {
      if (!ms.length) return '';
      const a = ms[0];
      const b = ms[ms.length - 1];
      if (a === b) return nice(a);
      return a.slice(0, 4) === b.slice(0, 4)
        ? `${M[Number(a.slice(5)) - 1]}–${nice(b)}`
        : `${nice(a)} – ${nice(b)}`;
    };
    if (!recent.length || !prior.length) {
      notes.push({ type: 'info', text: 'Need at least 6 full months in the selected period to compare channel trends.' });
      return notes;
    }
    const growing = channels.filter((c) => c.status === 'growing').sort((a, b) => b.recent3 - b.prior3 - (a.recent3 - a.prior3));
    const declining = channels.filter((c) => c.status === 'declining').sort((a, b) => a.recent3 - a.prior3 - (b.recent3 - b.prior3));
    for (const c of growing.slice(0, 3)) {
      notes.push({ type: 'good', text: `${c.channel} is growing: about ${c.recentAvg.toLocaleString()} sessions a month in ${label(recent)} vs ${c.priorAvg.toLocaleString()} a month in ${label(prior)} (+${c.change3m}%).` });
    }
    for (const c of declining.slice(0, 3)) {
      notes.push({ type: 'bad', text: `${c.channel} is declining: about ${c.recentAvg.toLocaleString()} sessions a month in ${label(recent)} vs ${c.priorAvg.toLocaleString()} a month in ${label(prior)} (${c.change3m}%).` });
    }
    for (const c of channels.filter((x) => x.status === 'new')) {
      notes.push({ type: 'good', text: `${c.channel} is a new source of traffic: ${c.recent3} sessions in the last 3 months and none before.` });
    }
    for (const c of channels.filter((x) => x.anomaly)) {
      notes.push({
        type: c.anomaly === 'spike' ? 'warn' : 'bad',
        text: `${c.channel} had a sudden ${c.anomaly} in ${nice(c.lastMonth.month)} (${c.lastMonth.sessions} sessions vs about ${c.lastMonth.typicalBefore} a month in the 3 months before). Check for a campaign, a bot or a tracking change.`,
      });
    }
    const top = channels[0];
    if (top) notes.push({ type: 'info', text: `${top.channel} brings the most traffic (${top.share}% of sessions).` });
    const bestConv = channels.filter((c) => c.sessions >= 50).sort((a, b) => b.keyEventRate - a.keyEventRate)[0];
    if (bestConv && bestConv.keyEventRate > 0) {
      notes.push({ type: 'info', text: `${bestConv.channel} converts best: ${bestConv.keyEventRate}% of its sessions lead to a key event.` });
    }
    const lowEng = channels.filter((c) => c.sessions >= 100 && c.engagementRate < 30);
    for (const c of lowEng) {
      notes.push({ type: 'warn', text: `${c.channel} has low engagement (${c.engagementRate}%). This traffic may be low quality, or landing on the wrong pages.` });
    }
    return notes;
  }

  // ─── 5 + 6. Page performance + suggestions ───────────────────────────────

  async getPages(workspaceId, websiteId, range) {
    const ctx = await this.resolveContext(workspaceId, websiteId, range);
    const { startDate, endDate } = ctx;
    const aiFilter = {
      filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'PARTIAL_REGEXP', value: AI_SOURCE_REGEX, caseSensitive: false } },
    };

    const [ga4Pages, scrollRows, aiRows, gscRows, clarityRows, clarityConn] = await Promise.all([
      this.ga4(workspaceId, websiteId, startDate, endDate, {
        dimensions: ['pagePath'],
        metrics: ['screenPageViews', 'sessions', 'engagedSessions', 'userEngagementDuration', 'totalUsers', 'keyEvents'],
      }),
      this.ga4(workspaceId, websiteId, startDate, endDate, {
        dimensions: ['pagePath'],
        metrics: ['eventCount'],
        filter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'scroll' } } },
      }),
      this.ga4(workspaceId, websiteId, startDate, endDate, {
        dimensions: ['landingPage'],
        metrics: ['sessions'],
        filter: aiFilter,
      }),
      prisma.gSCPageMetric.groupBy({
        by: ['page'],
        where: { websiteId, date: { gte: startDate, lte: endDate } },
        _sum: { clicks: true, impressions: true },
      }),
      prisma.clarityPageMetric.findMany({
        where: { websiteId, date: { gte: startDate, lte: endDate } },
        select: { page: true, sessions: true, avgScrollDepth: true, avgTimeOnPageSec: true, rageClicks: true, deadClicks: true, quickBacks: true },
      }),
      prisma.integrationConnection.findFirst({
        where: { websiteId, workspaceId, integrationType: 'CLARITY' },
        select: { clarityConnection: { select: { projectId: true } } },
      }),
    ]);

    // GSC position needs impression-weighting, which groupBy can't do in one go
    const gscPos = await prisma.gSCPageMetric.findMany({
      where: { websiteId, date: { gte: startDate, lte: endDate } },
      select: { page: true, impressions: true, avgPosition: true },
    });
    const posWeight = new Map();
    for (const r of gscPos) {
      const p = normalisePath(r.page);
      if (!p) continue;
      const w = posWeight.get(p) || { sum: 0, imp: 0 };
      w.sum += r.avgPosition * r.impressions;
      w.imp += r.impressions;
      posWeight.set(p, w);
    }

    const pages = new Map();
    const get = (path) => {
      if (!pages.has(path)) {
        pages.set(path, {
          path,
          views: 0, sessions: 0, engagedSessions: 0, engagementSec: 0, users: 0, keyEvents: 0,
          scroll90: 0, aiSessions: 0,
          impressions: 0, clicks: 0,
          clarity: null,
        });
      }
      return pages.get(path);
    };

    for (const r of ga4Pages) {
      const path = normalisePath(r.pagePath);
      if (!path) continue;
      const p = get(path);
      p.views += r.screenPageViews;
      p.sessions += r.sessions;
      p.engagedSessions += r.engagedSessions;
      p.engagementSec += r.userEngagementDuration;
      p.users += r.totalUsers;
      p.keyEvents += r.keyEvents;
    }
    for (const r of scrollRows) {
      const path = normalisePath(r.pagePath);
      if (path && pages.has(path)) pages.get(path).scroll90 += r.eventCount;
    }
    for (const r of aiRows) {
      const path = normalisePath(r.landingPage);
      if (path) get(path).aiSessions += r.sessions;
    }
    for (const r of gscRows) {
      const path = normalisePath(r.page);
      if (!path) continue;
      const p = get(path);
      p.impressions += r._sum.impressions || 0;
      p.clicks += r._sum.clicks || 0;
    }
    const clarityAgg = new Map();
    for (const r of clarityRows) {
      const path = normalisePath(r.page);
      if (!path) continue;
      const c = clarityAgg.get(path) || { sessions: 0, scrollW: 0, timeW: 0, rageClicks: 0, deadClicks: 0, quickBacks: 0 };
      c.sessions += r.sessions;
      c.scrollW += r.avgScrollDepth * r.sessions;
      c.timeW += r.avgTimeOnPageSec * r.sessions;
      c.rageClicks += r.rageClicks;
      c.deadClicks += r.deadClicks;
      c.quickBacks += r.quickBacks;
      clarityAgg.set(path, c);
    }
    for (const [path, c] of clarityAgg) {
      const scroll = c.sessions ? c.scrollW / c.sessions : 0;
      get(path).clarity = {
        sessions: c.sessions,
        // Clarity sometimes returns 0 when it has no scroll data for a page
        scrollDepth: scroll > 0 ? round(scroll, 1) : null,
        timeOnPageSec: c.sessions && c.timeW > 0 ? round(c.timeW / c.sessions, 0) : null,
        rageClicks: c.rageClicks,
        deadClicks: c.deadClicks,
        quickBacks: c.quickBacks,
      };
    }

    const projectId = clarityConn?.clarityConnection?.projectId || null;
    const domain = ctx.website.domain?.replace(/^https?:\/\//, '').replace(/\/$/, '');

    const rows = [...pages.values()]
      .map((p) => {
        const pos = posWeight.get(p.path);
        const row = {
          path: p.path,
          url: domain ? `https://${domain}${p.path === '/' ? '/' : `${p.path}/`}` : null,
          impressions: p.impressions,
          clicks: p.clicks,
          ctr: p.impressions ? round((p.clicks / p.impressions) * 100, 2) : null,
          position: pos?.imp ? round(pos.sum / pos.imp, 1) : null,
          views: p.views,
          sessions: p.sessions,
          users: p.users,
          engagementRate: p.sessions ? round((p.engagedSessions / p.sessions) * 100, 1) : null,
          avgEngagementSec: p.users ? round(p.engagementSec / p.users, 0) : null,
          scroll90Rate: p.views ? round(Math.min(100, (p.scroll90 / p.views) * 100), 1) : null,
          keyEvents: p.keyEvents,
          aiSessions: p.aiSessions,
          clarity: p.clarity,
        };
        if (projectId && row.url) {
          row.heatmapUrl = `https://clarity.microsoft.com/projects/view/${projectId}/heatmaps?url=${encodeURIComponent(row.url)}`;
        }
        return row;
      })
      .filter((r) => r.views > 0 || r.impressions > 0);

    const siteAvg = this.siteAverages(rows);
    for (const r of rows) r.issues = this.pageIssues(r, siteAvg);
    rows.sort((a, b) => b.views + b.clicks - (a.views + a.clicks));

    const needsAttention = rows
      .filter((r) => r.issues.length)
      .sort((a, b) => b.issues.reduce((s, i) => s + i.score, 0) - a.issues.reduce((s, i) => s + i.score, 0))
      .slice(0, 15);

    return {
      ...ctx,
      clarityProjectId: projectId,
      dataFrom: {
        gsc: (await prisma.gSCPageMetric.aggregate({ where: { websiteId, date: { gte: startDate, lte: endDate } }, _min: { date: true } }))._min.date,
        clarity: (await prisma.clarityPageMetric.aggregate({ where: { websiteId, date: { gte: startDate, lte: endDate } }, _min: { date: true } }))._min.date,
      },
      siteAverages: siteAvg,
      pages: rows.slice(0, 500),
      totalPages: rows.length,
      needsAttention,
    };
  }

  siteAverages(rows) {
    const tot = rows.reduce(
      (a, r) => {
        a.views += r.views;
        a.sessions += r.sessions;
        a.engaged += r.engagementRate !== null ? (r.engagementRate / 100) * r.sessions : 0;
        a.scroll += r.scroll90Rate !== null ? (r.scroll90Rate / 100) * r.views : 0;
        a.impressions += r.impressions;
        a.clicks += r.clicks;
        return a;
      },
      { views: 0, sessions: 0, engaged: 0, scroll: 0, impressions: 0, clicks: 0 }
    );
    return {
      engagementRate: tot.sessions ? round((tot.engaged / tot.sessions) * 100, 1) : 0,
      scroll90Rate: tot.views ? round((tot.scroll / tot.views) * 100, 1) : 0,
      ctr: tot.impressions ? round((tot.clicks / tot.impressions) * 100, 2) : 0,
      medianViews: (() => {
        const v = rows.map((r) => r.views).filter((x) => x > 0).sort((a, b) => a - b);
        return v.length ? v[Math.floor(v.length / 2)] : 0;
      })(),
    };
  }

  /** Rule-based suggestions for one page. score = how much it matters. */
  pageIssues(r, avg) {
    const issues = [];
    const enoughViews = r.views >= 30;

    if (enoughViews && r.scroll90Rate !== null && r.scroll90Rate < Math.min(25, avg.scroll90Rate * 0.6)) {
      issues.push({
        type: 'low_scroll',
        label: 'Low scroll',
        detail: `Only ${r.scroll90Rate}% of views reach the bottom (site average ${avg.scroll90Rate}%). Move the key message and call to action higher, and shorten long intros.`,
        score: 3 + Math.log10(r.views),
      });
    }
    if (enoughViews && r.engagementRate !== null && r.engagementRate < Math.min(40, avg.engagementRate * 0.7)) {
      issues.push({
        type: 'low_engagement',
        label: 'Low engagement',
        detail: `${r.engagementRate}% engaged sessions (site average ${avg.engagementRate}%). Check the page matches what visitors searched for, speeds up on mobile, and gives a clear next step.`,
        score: 3 + Math.log10(r.views),
      });
    }
    if (r.impressions >= 500 && r.ctr !== null && r.ctr < Math.max(1, avg.ctr * 0.5) && (r.position === null || r.position <= 15)) {
      issues.push({
        type: 'low_ctr',
        label: 'Low CTR',
        detail: `${r.impressions.toLocaleString()} impressions but only ${r.ctr}% click (site average ${avg.ctr}%). Rewrite the title and meta description to match the search intent.`,
        score: 2 + Math.log10(r.impressions),
      });
    }
    if (r.impressions >= 200 && r.position !== null && r.position > 8 && r.position <= 20) {
      issues.push({
        type: 'striking_distance',
        label: 'Almost page 1',
        detail: `Average position ${r.position}. Adding depth, internal links and fresh content could move it onto the first page.`,
        score: 2 + Math.log10(r.impressions),
      });
    }
    if (r.clicks >= 30 && r.engagementRate !== null && r.engagementRate < 35) {
      issues.push({
        type: 'intent_mismatch',
        label: 'Search visitors leave',
        detail: `Gets ${r.clicks} search clicks but most visitors don't engage. The content may not answer what people searched for.`,
        score: 3,
      });
    }
    if (r.clarity && r.clarity.rageClicks + r.clarity.deadClicks >= 5) {
      issues.push({
        type: 'frustration',
        label: 'Frustration clicks',
        detail: `${r.clarity.rageClicks} rage clicks and ${r.clarity.deadClicks} dead clicks recorded in Clarity. Look at the heatmap for elements people expect to be clickable.`,
        score: 2.5,
      });
    }
    if (r.impressions >= 1000 && r.views < Math.max(10, avg.medianViews * 0.3)) {
      issues.push({
        type: 'visibility_no_visits',
        label: 'Seen but not visited',
        detail: `Shows up in search ${r.impressions.toLocaleString()} times but gets very few visits.`,
        score: 1.5,
      });
    }
    return issues;
  }
}

export const insightsService = new InsightsService();
export default insightsService;
