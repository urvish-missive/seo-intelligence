// backend/src/modules/integrations/bing/bing.service.js
// Bing Webmaster Tools integration: connect with an API key, pick a verified
// site, and import search performance into MySQL.
//
// API: https://ssl.bing.com/webmaster/api.svc/json/<Method>?apikey=...
//   GetUserSites            → sites the key's account can access
//   GetRankAndTrafficStats  → daily clicks + impressions
//   GetQueryStats           → per query, weekly buckets (clicks, impressions, avg positions)
//   GetPageStats            → per page, same shape as GetQueryStats
// Responses are wrapped as { "d": [...] }; dates look like "/Date(1399014000000-0700)/".
// The API has no date-range parameters: every call returns all history Bing keeps.

import prisma from '../../../config/database.js';
import { BadRequestError, NotFoundError } from '../../../middleware/errorHandler.js';
import { encrypt, decrypt } from '../../../utils/encryption.js';
import { safeAuditLog } from '../../../utils/safeAuditLog.js';
import logger from '../../../utils/logger.js';

const API_BASE = 'https://ssl.bing.com/webmaster/api.svc/json';
const REQUEST_TIMEOUT_MS = 30000;
const WRITE_BATCH = 200;

// ─── API client ──────────────────────────────────────────────────────────────

/** Call one Bing Webmaster API method. Never puts the key in errors or logs. */
async function callBing(method, apiKey, params = {}) {
  const qs = new URLSearchParams({ ...params, apikey: apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_BASE}/${method}?${qs}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timed out' : err.cause?.code || err.message;
    throw new BadRequestError(`Couldn't reach Bing Webmaster Tools (${reason}). Check the internet connection and try again.`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const msg = body?.Message || `HTTP ${res.status}`;
    if (/InvalidApiKey/i.test(msg)) {
      throw new BadRequestError('Bing rejected the API key. Copy it again from Bing Webmaster Tools → Settings → API access.');
    }
    if (/NotAuthorized|UserNotAuthorized|AccessDenied/i.test(msg)) {
      throw new BadRequestError("This API key's account can't access that site in Bing Webmaster Tools.");
    }
    if (/ThrottleUser|Throttle/i.test(msg)) {
      throw new BadRequestError('Bing is limiting requests for this key right now. Try again in a few minutes.');
    }
    throw new BadRequestError(`Bing Webmaster Tools error: ${msg}`);
  }
  return Array.isArray(body?.d) ? body.d : body?.d ?? [];
}

/** "/Date(1399014000000-0700)/" → "2014-05-02" (the day in Bing's own timezone). */
export function parseBingDate(value) {
  const m = String(value ?? '').match(/\/Date\((-?\d+)([+-]\d{4})?\)\//);
  if (!m) {
    const iso = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  let ms = Number(m[1]);
  if (m[2]) {
    const sign = m[2][0] === '-' ? -1 : 1;
    const minutes = Number(m[2].slice(1, 3)) * 60 + Number(m[2].slice(3, 5));
    ms += sign * minutes * 60 * 1000;
  }
  return new Date(ms).toISOString().slice(0, 10);
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const normaliseSite = (url) => String(url || '').trim().replace(/\/+$/, '').toLowerCase();

// ─── Service ─────────────────────────────────────────────────────────────────

export class BingService {
  async verifyWebsite(workspaceId, websiteId) {
    const website = await prisma.website.findFirst({ where: { id: websiteId, workspaceId }, select: { id: true, domain: true, url: true } });
    if (!website) throw new NotFoundError('Website not found in this workspace.');
    return website;
  }

  async getConnection(workspaceId, websiteId) {
    return prisma.integrationConnection.findFirst({ where: { websiteId, workspaceId, integrationType: 'BING' } });
  }

  /** Stored key for this website, if it has one. */
  async storedKey(workspaceId, websiteId) {
    const conn = await this.getConnection(workspaceId, websiteId);
    if (!conn?.credentialsEnc) return null;
    try {
      return decrypt(conn.credentialsEnc);
    } catch {
      return null;
    }
  }

  /**
   * Sites the API key can access. With no key given, uses the website's stored
   * key (for changing site later). Sorted with the website's own domain first.
   */
  async listSites(workspaceId, websiteId, apiKey) {
    const website = await this.verifyWebsite(workspaceId, websiteId);
    const key = (apiKey || '').trim() || (await this.storedKey(workspaceId, websiteId));
    if (!key) throw new BadRequestError('Enter your Bing Webmaster Tools API key.');

    const sites = await callBing('GetUserSites', key);
    const domain = String(website.domain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();
    return {
      sites: sites
        .map((s) => ({ url: s.Url || s.url, verified: s.IsVerified ?? s.isVerified ?? true }))
        .filter((s) => s.url)
        .sort((a, b) => Number(b.url.toLowerCase().includes(domain)) - Number(a.url.toLowerCase().includes(domain)) || a.url.localeCompare(b.url)),
      suggested: sites.map((s) => s.Url || s.url).find((u) => u && u.toLowerCase().includes(domain)) || null,
    };
  }

  /** Save the key (encrypted) and the chosen site for this website. */
  async connect(workspaceId, websiteId, { apiKey, siteUrl }, user) {
    await this.verifyWebsite(workspaceId, websiteId);
    if (!siteUrl) throw new BadRequestError('Choose which Bing site to connect.');
    const key = (apiKey || '').trim() || (await this.storedKey(workspaceId, websiteId));
    if (!key) throw new BadRequestError('Enter your Bing Webmaster Tools API key.');

    // Validates the key and that it can access the site
    const { sites } = await this.listSites(workspaceId, websiteId, key);
    const match = sites.find((s) => normaliseSite(s.url) === normaliseSite(siteUrl));
    if (!match) throw new BadRequestError(`${siteUrl} isn't one of the sites this API key can access in Bing Webmaster Tools.`);

    const data = {
      status: 'CONNECTED',
      credentialsEnc: encrypt(key),
      selectedProperty: match.url,
      selectedPropertyName: match.url,
      lastError: null,
    };
    const conn = await prisma.integrationConnection.upsert({
      where: { websiteId_integrationType: { websiteId, integrationType: 'BING' } },
      update: data,
      create: { websiteId, workspaceId, integrationType: 'BING', ...data },
    });

    // A schedule turned off by an earlier disconnect comes back on; a missing
    // one is created by the scheduler within the hour
    await prisma.syncSchedule.updateMany({ where: { websiteId, provider: 'BING' }, data: { enabled: true, connectionId: conn.id } });

    await safeAuditLog({
      workspaceId,
      userId: user?.id || null,
      action: 'integration.bing_connected',
      entityType: 'Website',
      entityId: websiteId,
      metadata: { siteUrl: match.url },
    });
    return { id: conn.id, status: conn.status, siteUrl: match.url };
  }

  async disconnect(workspaceId, websiteId, user) {
    const conn = await this.getConnection(workspaceId, websiteId);
    if (!conn) throw new NotFoundError('Bing Webmaster Tools is not connected to this website.');
    await prisma.integrationConnection.update({
      where: { id: conn.id },
      data: { status: 'NOT_CONNECTED', credentialsEnc: null, selectedProperty: null, selectedPropertyName: null },
    });
    await prisma.syncSchedule.updateMany({ where: { websiteId, provider: 'BING' }, data: { enabled: false } });
    await safeAuditLog({
      workspaceId,
      userId: user?.id || null,
      action: 'integration.bing_disconnected',
      entityType: 'Website',
      entityId: websiteId,
    });
    return { disconnected: true };
  }

  /** Pull everything Bing has (daily totals, weekly queries and pages) into MySQL. */
  async importBingData({ workspaceId, websiteId, user }) {
    const conn = await this.getConnection(workspaceId, websiteId);
    if (!conn || conn.status === 'NOT_CONNECTED' || !conn.selectedProperty) {
      throw new NotFoundError('Bing Webmaster Tools is not connected to this website.');
    }
    const key = await this.storedKey(workspaceId, websiteId);
    if (!key) throw new BadRequestError('The saved Bing API key is missing. Reconnect Bing for this website.');
    const siteUrl = conn.selectedProperty;
    const started = Date.now();

    await prisma.integrationConnection.update({ where: { id: conn.id }, data: { status: 'SYNCING' } });
    try {
      const [daily, queries, pages] = await Promise.all([
        callBing('GetRankAndTrafficStats', key, { siteUrl }),
        callBing('GetQueryStats', key, { siteUrl }),
        callBing('GetPageStats', key, { siteUrl }),
      ]);

      const ops = [];
      for (const r of daily) {
        const date = parseBingDate(r.Date);
        if (!date) continue;
        const values = { clicks: num(r.Clicks), impressions: num(r.Impressions) };
        ops.push(
          prisma.bingDailyMetric.upsert({
            where: { websiteId_date: { websiteId, date } },
            update: values,
            create: { websiteId, date, ...values },
          })
        );
      }

      // Query/page rows: several rows per (week, query) are merged before saving
      const merge = (rows, field) => {
        const map = new Map();
        for (const r of rows) {
          const date = parseBingDate(r.Date);
          const name = String(r.Query ?? r.Page ?? r.Url ?? '').trim();
          if (!date || !name) continue;
          const key2 = `${date}|${name.toLowerCase().slice(0, 300)}`;
          const m = map.get(key2) || { date, [field]: name.slice(0, field === 'page' ? 2048 : 1000), clicks: 0, impressions: 0, imprPosW: 0, clickPosW: 0 };
          const impressions = num(r.Impressions);
          const clicks = num(r.Clicks);
          m.clicks += clicks;
          m.impressions += impressions;
          m.imprPosW += num(r.AvgImpressionPosition) * impressions;
          m.clickPosW += num(r.AvgClickPosition) * clicks;
          map.set(key2, m);
        }
        return [...map.values()].map((m) => ({
          date: m.date,
          [field]: m[field],
          clicks: m.clicks,
          impressions: m.impressions,
          avgImpressionPosition: m.impressions ? Math.round((m.imprPosW / m.impressions) * 100) / 100 : 0,
          avgClickPosition: m.clicks ? Math.round((m.clickPosW / m.clicks) * 100) / 100 : 0,
        }));
      };

      const queryRows = merge(queries, 'query');
      const pageRows = merge(pages, 'page');
      for (const r of queryRows) {
        ops.push(
          prisma.bingQueryMetric.upsert({
            where: { websiteId_date_query: { websiteId, date: r.date, query: r.query } },
            update: r,
            create: { websiteId, ...r },
          })
        );
      }
      for (const r of pageRows) {
        ops.push(
          prisma.bingPageMetric.upsert({
            where: { websiteId_date_page: { websiteId, date: r.date, page: r.page } },
            update: r,
            create: { websiteId, ...r },
          })
        );
      }

      for (let i = 0; i < ops.length; i += WRITE_BATCH) {
        await prisma.$transaction(ops.slice(i, i + WRITE_BATCH));
      }

      const dates = daily.map((r) => parseBingDate(r.Date)).filter(Boolean).sort();
      await prisma.integrationConnection.update({
        where: { id: conn.id },
        data: { status: 'CONNECTED', lastSyncAt: new Date(), lastSyncStatus: 'COMPLETED', lastError: null },
      });
      const result = {
        siteUrl,
        dailyRows: daily.length,
        queryRows: queryRows.length,
        pageRows: pageRows.length,
        rowsInserted: ops.length,
        dataFrom: dates[0] || null,
        dataTo: dates[dates.length - 1] || null,
        durationMs: Date.now() - started,
      };
      await safeAuditLog({
        workspaceId,
        userId: user?.id && user.id !== 'system-scheduler' && user.id !== 'automated-scheduler' ? user.id : null,
        action: 'integration.bing_data_imported',
        entityType: 'Website',
        entityId: websiteId,
        metadata: { ...result },
      });
      logger.info(`[Bing] Imported ${ops.length} rows for website ${websiteId} (${result.dataFrom} → ${result.dataTo})`);
      return result;
    } catch (err) {
      await prisma.integrationConnection
        .update({ where: { id: conn.id }, data: { status: 'CONNECTED', lastSyncStatus: 'FAILED', lastError: err.message } })
        .catch(() => {});
      throw err;
    }
  }

  /** Connection summary for the website page. */
  async status(workspaceId, websiteId) {
    await this.verifyWebsite(workspaceId, websiteId);
    const conn = await this.getConnection(workspaceId, websiteId);
    const range = await prisma.bingDailyMetric.aggregate({ where: { websiteId }, _min: { date: true }, _max: { date: true }, _count: true });
    return {
      connected: !!conn && conn.status !== 'NOT_CONNECTED' && !!conn.selectedProperty,
      status: conn?.status || 'NOT_CONNECTED',
      siteUrl: conn?.selectedProperty || null,
      lastSyncAt: conn?.lastSyncAt || null,
      lastSyncStatus: conn?.lastSyncStatus || null,
      lastError: conn?.lastError || null,
      data: { days: range._count, from: range._min.date, to: range._max.date },
    };
  }
}

export const bingService = new BingService();
export default bingService;
