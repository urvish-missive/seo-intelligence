// backend/src/modules/integrations/clarity/clarityCsv.service.js
// Import of Microsoft Clarity dashboard CSV downloads, one file per month.
//
// Clarity's Data Export API only returns the last 1-3 days, but the dashboard
// keeps ~13 months and can be downloaded as CSV. Microsoft doesn't document
// the CSV layout, so the parser is deliberately tolerant: it recognises
// metrics by name wherever they appear (label/value rows or table headers),
// and every file is previewed before anything is saved.
//
// Each imported month is stored as a ClarityImportSnapshot with preset
// CSV_MONTHLY (no schema change needed); Monthly Charts reads them back.

import prisma from '../../../config/database.js';
import { BadRequestError, NotFoundError } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';

export const CSV_PRESET = 'CSV_MONTHLY';
const MAX_FILES = 24;
const MAX_FILE_CHARS = 2 * 1024 * 1024;
const MAX_LIST_ROWS = 200;

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Metric name variants seen in Clarity's UI and exports. kind decides how values are read. */
const METRICS = {
  sessions: { kind: 'count', keys: ['sessions', 'totalsessions', 'sessionscount', 'numberofsessions', 'visits'] },
  botSessions: { kind: 'count', keys: ['botsessions', 'bottraffic', 'bots'] },
  distinctUsers: { kind: 'count', keys: ['users', 'distinctusers', 'uniqueusers', 'totalusers', 'uniquevisitors', 'visitors'] },
  pagesPerSession: { kind: 'decimal', keys: ['pagespersession', 'pagessession', 'pageviewspersession'] },
  avgScrollDepth: { kind: 'percent', keys: ['scrolldepth', 'averagescrolldepth', 'avgscrolldepth'] },
  avgTimeOnPageSec: {
    kind: 'duration',
    keys: ['activetime', 'activetimespent', 'averageactivetime', 'avgactivetime', 'engagementtime', 'timespent', 'averagetimespent', 'timeonpage', 'totaltimespent'],
  },
  rageClickCount: { kind: 'count', keys: ['rageclicks', 'rageclickcount', 'rageclick'] },
  deadClickCount: { kind: 'count', keys: ['deadclicks', 'deadclickcount', 'deadclick'] },
  quickbackClickCount: { kind: 'count', keys: ['quickbacks', 'quickbackclicks', 'quickback', 'quickbackclick'] },
  excessiveScrollCount: { kind: 'count', keys: ['excessivescrolling', 'excessivescroll', 'excessivescrolls'] },
  scriptErrorCount: { kind: 'count', keys: ['javascripterrors', 'scripterrors', 'jserrors', 'scripterrorcount', 'javascripterror'] },
  errorClickCount: { kind: 'count', keys: ['errorclicks', 'errorclickcount', 'errorclick'] },
};
const KEY_TO_METRIC = new Map();
for (const [metric, def] of Object.entries(METRICS)) def.keys.forEach((k) => KEY_TO_METRIC.set(k, metric));

const LIST_TABLES = {
  pages: ['url', 'urls', 'page', 'pages', 'pageurl', 'popularpages', 'pagetitle', 'address', 'path', 'landingpage'],
  devices: ['device', 'devices', 'devicetype', 'devicecategory'],
  countries: ['country', 'countries', 'countryregion', 'region', 'location'],
};
const LIST_VALUE_KEYS = ['sessions', 'visits', 'count', 'pageviews', 'views', 'users', 'total'];

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// ─── Low-level parsing ───────────────────────────────────────────────────────

/** RFC 4180-ish CSV parser (quotes, escaped quotes, newlines in quotes, , ; or tab). */
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const sample = src.split(/\r?\n/).slice(0, 20).join('\n');
  const counts = { ',': (sample.match(/,/g) || []).length, ';': (sample.match(/;/g) || []).length, '\t': (sample.match(/\t/g) || []).length };
  const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ',';

  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delim) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

/** First number in a cell: "1,234", "45.2%", "12 (3.4%)" → { value, percent }. */
function readNumber(cell) {
  const s = String(cell ?? '').trim();
  if (!s) return null;
  const m = s.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const after = s.slice(s.indexOf(m[0]) + m[0].length, s.indexOf(m[0]) + m[0].length + 2);
  return { value: Number(m[0]), percent: after.trim().startsWith('%') };
}

/** Durations: "1m 23s", "1 min 23 sec", "01:23", "00:01:23", "83s", "83" → seconds. */
function readDuration(cell) {
  const s = String(cell ?? '').trim().toLowerCase();
  if (!s) return null;
  const hms = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (hms) return hms[3] !== undefined ? +hms[1] * 3600 + +hms[2] * 60 + +hms[3] : +hms[1] * 60 + +hms[2];
  const h = s.match(/(\d+(?:\.\d+)?)\s*h/);
  const mi = s.match(/(\d+(?:\.\d+)?)\s*m(?!s)/);
  const se = s.match(/(\d+(?:\.\d+)?)\s*s/);
  if (h || mi || se) return Math.round((h ? +h[1] * 3600 : 0) + (mi ? +mi[1] * 60 : 0) + (se ? +se[1] : 0));
  const n = readNumber(s);
  return n ? n.value : null;
}

function readMetricValue(metric, cell) {
  const kind = METRICS[metric].kind;
  if (kind === 'duration') {
    const v = readDuration(cell);
    return v === null ? null : { value: v };
  }
  const n = readNumber(cell);
  if (!n) return null;
  return n;
}

// ─── Dates ───────────────────────────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(2, '0');
}
function validDate(y, m, d) {
  if (y < 2015 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** All calendar dates written in a piece of text. */
function findDates(text) {
  const out = [];
  const s = String(text);
  for (const m of s.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    const d = validDate(+m[1], +m[2], +m[3]);
    if (d) out.push(d);
  }
  for (const m of s.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g)) {
    const a = +m[1];
    const b = +m[2];
    // Clarity uses US order; if the first part can't be a month, read it as day/month
    const d = a > 12 ? validDate(+m[3], b, a) : validDate(+m[3], a, b);
    if (d) out.push(d);
  }
  const mon = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
  for (const m of s.matchAll(new RegExp(`\\b${mon}\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'gi'))) {
    const d = validDate(+m[3], MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]);
    if (d) out.push(d);
  }
  for (const m of s.matchAll(new RegExp(`\\b(\\d{1,2})\\s+${mon},?\\s+(\\d{4})\\b`, 'gi'))) {
    const d = validDate(+m[3], MONTH_NAMES.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]);
    if (d) out.push(d);
  }
  return out;
}

/** "Clarity_Site_Dashboard_2025-12.csv", "...Dec 2025..." → YYYY-MM (a guess). */
function monthFromFileName(name) {
  const s = String(name);
  const ym = s.match(/\b(20\d{2})[-_.](0[1-9]|1[0-2])\b(?![-_.]\d{2}\b)/);
  if (ym) return `${ym[1]}-${ym[2]}`;
  const mn = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s_-]*(20\d{2})/i);
  if (mn) return `${mn[2]}-${pad(MONTH_NAMES.indexOf(mn[1].slice(0, 3).toLowerCase()) + 1)}`;
  return null;
}

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The month a date range belongs to (the one covering most of its days). */
function monthForRange(start, end) {
  const counts = new Map();
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  for (let i = 0; d <= last && i < 400; i++) {
    const ym = d.toISOString().slice(0, 7);
    counts.set(ym, (counts.get(ym) || 0) + 1);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// ─── Extraction ──────────────────────────────────────────────────────────────

/**
 * Turn one CSV file into { metrics, pages, devices, countries, month, ... }.
 * Exported for tests and for the preview endpoint.
 */
export function extractClarityCsv(text, fileName = '') {
  const rows = parseCsv(text);
  const metrics = {};
  const extras = {}; // e.g. rageClickPct when Clarity shows "% of sessions"
  const warnings = [];
  const setMetric = (metric, cell, from) => {
    const r = readMetricValue(metric, cell);
    if (!r) return false;
    const kind = METRICS[metric].kind;
    if (kind === 'count' && r.percent) {
      if (extras[`${metric}Pct`] === undefined) extras[`${metric}Pct`] = r.value;
      return false;
    }
    if (metrics[metric] === undefined) {
      metrics[metric] = kind === 'count' ? Math.round(r.value) : Math.round(r.value * 100) / 100;
      metrics[`__from_${metric}`] = from;
    }
    return true;
  };

  // A) Tables whose header row names metrics (optionally one row per date)
  const consumedRows = new Set();
  for (let i = 0; i < rows.length - 1; i++) {
    const header = rows[i];
    const cols = header.map((c, idx) => ({ idx, metric: KEY_TO_METRIC.get(norm(c)) })).filter((c) => c.metric);
    if (cols.length < 2) continue;
    const dateCol = header.findIndex((c) => ['date', 'day', 'daterange'].includes(norm(c)));
    const dataRows = [];
    for (let j = i + 1; j < rows.length; j++) {
      const r = rows[j];
      if (!cols.some((c) => readNumber(r[c.idx]))) break;
      dataRows.push(r);
    }
    if (!dataRows.length) continue;
    consumedRows.add(i);
    dataRows.forEach((_, k) => consumedRows.add(i + 1 + k));

    if (dateCol >= 0 && dataRows.length > 1) {
      // Daily breakdown: add counts, weight rates by sessions
      const sessIdx = cols.find((c) => c.metric === 'sessions')?.idx;
      for (const c of cols) {
        if (metrics[c.metric] !== undefined) continue;
        const kind = METRICS[c.metric].kind;
        let sum = 0;
        let wsum = 0;
        let wtot = 0;
        for (const r of dataRows) {
          const v = kind === 'duration' ? readDuration(r[c.idx]) : readNumber(r[c.idx])?.value;
          if (v === null || v === undefined) continue;
          const w = sessIdx !== undefined ? readNumber(r[sessIdx])?.value || 0 : 1;
          sum += v;
          wsum += v * w;
          wtot += w;
        }
        metrics[c.metric] = kind === 'count' ? Math.round(sum) : wtot ? Math.round((wsum / wtot) * 100) / 100 : null;
        metrics[`__from_${c.metric}`] = 'daily table';
      }
      if (cols.some((c) => c.metric === 'distinctUsers')) {
        warnings.push('Users were added up from daily rows, so a visitor on several days is counted more than once.');
      }
    } else {
      for (const c of cols) setMetric(c.metric, dataRows[0][c.idx], 'table');
    }
  }

  // B) Label / value rows: "Sessions, 1,234" or "Rage clicks, 2.3%, 45"
  rows.forEach((r, i) => {
    if (consumedRows.has(i)) return;
    for (let c = 0; c < r.length; c++) {
      const metric = KEY_TO_METRIC.get(norm(r[c]));
      if (!metric) continue;
      for (let v = c + 1; v < r.length; v++) {
        if (KEY_TO_METRIC.has(norm(r[v]))) break; // next label on the same row
        if (setMetric(metric, r[v], 'row')) break;
      }
    }
  });

  // C) Lists: pages, devices, countries
  const lists = { pages: [], devices: [], countries: [] };
  for (let i = 0; i < rows.length - 1; i++) {
    const header = rows[i].map(norm);
    for (const [listName, keys] of Object.entries(LIST_TABLES)) {
      if (lists[listName].length) continue;
      const nameIdx = header.findIndex((h) => keys.includes(h));
      if (nameIdx < 0) continue;
      const valIdx = header.findIndex((h, idx) => idx !== nameIdx && LIST_VALUE_KEYS.includes(h));
      if (valIdx < 0) continue;
      for (let j = i + 1; j < rows.length && lists[listName].length < MAX_LIST_ROWS; j++) {
        const name = rows[j][nameIdx];
        const val = readNumber(rows[j][valIdx]);
        if (!name || !val) break;
        lists[listName].push({ name: String(name).slice(0, 500), sessions: Math.round(val.value) });
      }
    }
  }

  // D) Month: dates inside the file (ignoring "exported on" style cells), else file name
  const dates = [];
  for (const r of rows) {
    // Skip "Exported on, 2026-11-27" style rows: that's the download date
    if (r.some((cell) => /export|download|generated|created|printed/i.test(cell))) continue;
    for (const cell of r) dates.push(...findDates(cell));
  }
  dates.sort();
  let month = null;
  let monthSource = null;
  let dateRange = null;
  if (dates.length) {
    dateRange = { start: dates[0], end: dates[dates.length - 1] };
    month = monthForRange(dateRange.start, dateRange.end);
    monthSource = 'content';
    const full = `${month}-01` === dateRange.start && `${month}-${pad(daysInMonth(month))}` === dateRange.end;
    if (!full) {
      warnings.push(
        `The dates in this file run ${dateRange.start} to ${dateRange.end}, which isn't exactly one calendar month. Its numbers will be saved as ${month}.`
      );
    }
  } else {
    month = monthFromFileName(fileName);
    if (month) monthSource = 'filename';
  }

  const clean = Object.fromEntries(Object.entries(metrics).filter(([k, v]) => !k.startsWith('__from_') && v !== null && v !== undefined));
  if (clean.avgScrollDepth !== undefined && clean.avgScrollDepth <= 1 && clean.avgScrollDepth > 0) {
    clean.avgScrollDepth = Math.round(clean.avgScrollDepth * 10000) / 100; // 0.45 → 45%
  }
  if (!clean.sessions && !clean.distinctUsers) {
    warnings.push("Couldn't find sessions or users. Check this is the dashboard summary download, not a single chart.");
  }

  return {
    metrics: clean,
    extras,
    metricsFound: Object.keys(clean).length,
    pages: lists.pages,
    devices: lists.devices,
    countries: lists.countries,
    month,
    monthSource,
    dateRange,
    warnings,
    rowCount: rows.length,
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

function checkFiles(files) {
  if (!Array.isArray(files) || !files.length) throw new BadRequestError('Add at least one CSV file.');
  if (files.length > MAX_FILES) throw new BadRequestError(`Upload at most ${MAX_FILES} files at a time.`);
  for (const f of files) {
    if (!f || typeof f.content !== 'string' || !f.content.trim()) throw new BadRequestError(`${f?.name || 'A file'} is empty.`);
    if (f.content.length > MAX_FILE_CHARS) throw new BadRequestError(`${f.name} is larger than 2 MB.`);
  }
}

export class ClarityCsvService {
  async getClarityLink(workspaceId, websiteId) {
    const website = await prisma.website.findFirst({ where: { id: websiteId, workspaceId }, select: { id: true } });
    if (!website) throw new NotFoundError('Website not found in this workspace.');
    const integration = await prisma.integrationConnection.findFirst({
      where: { websiteId, workspaceId, integrationType: 'CLARITY' },
      select: { clarityConnectionId: true },
    });
    if (!integration?.clarityConnectionId) {
      throw new BadRequestError('Connect Microsoft Clarity to this website before importing its history.');
    }
    return integration.clarityConnectionId;
  }

  async preview(workspaceId, websiteId, files) {
    checkFiles(files);
    await this.getClarityLink(workspaceId, websiteId);
    return {
      files: files.map((f) => {
        const r = extractClarityCsv(f.content, f.name);
        return {
          name: f.name,
          metrics: r.metrics,
          metricsFound: r.metricsFound,
          pagesCount: r.pages.length,
          devicesCount: r.devices.length,
          countriesCount: r.countries.length,
          month: r.month,
          monthSource: r.monthSource,
          dateRange: r.dateRange,
          warnings: r.warnings,
        };
      }),
    };
  }

  async import(workspaceId, websiteId, files, user) {
    checkFiles(files);
    const clarityConnectionId = await this.getClarityLink(workspaceId, websiteId);
    const currentMonth = new Date().toISOString().slice(0, 7);

    const months = new Set();
    const parsed = files.map((f) => {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(f.month || '')) throw new BadRequestError(`Pick a month for ${f.name}.`);
      if (f.month > currentMonth) throw new BadRequestError(`${f.name} is set to ${f.month}, which is in the future.`);
      if (months.has(f.month)) throw new BadRequestError(`Two files are set to ${f.month}. Keep one per month.`);
      months.add(f.month);
      const r = extractClarityCsv(f.content, f.name);
      if (!r.metricsFound) throw new BadRequestError(`No Clarity metrics were recognised in ${f.name}.`);
      return { file: f, r };
    });

    let replaced = 0;
    const imported = [];
    for (const { file, r } of parsed) {
      const windowStart = new Date(`${file.month}-01T00:00:00.000Z`);
      const windowEnd = new Date(`${file.month}-${pad(daysInMonth(file.month))}T23:59:59.999Z`);
      const payload = {
        source: 'clarity_dashboard_csv',
        month: file.month,
        fileName: file.name,
        importedAt: new Date().toISOString(),
        importedBy: user?.id || null,
        metrics: r.metrics,
        extras: r.extras,
        pages: r.pages,
        devices: r.devices,
        countries: r.countries,
        dateRange: r.dateRange,
        warnings: r.warnings,
      };

      const result = await prisma.$transaction(async (tx) => {
        const del = await tx.clarityImportSnapshot.deleteMany({ where: { websiteId, preset: CSV_PRESET, windowStart } });
        const snap = await tx.clarityImportSnapshot.create({
          data: {
            workspaceId,
            clarityConnectionId,
            websiteId,
            requestedNumOfDays: daysInMonth(file.month),
            windowStart,
            windowEnd,
            preset: CSV_PRESET,
            dimensions: String(file.name).slice(0, 255),
            rawResponseJson: JSON.stringify(payload),
            rowCount: r.pages.length,
            status: 'COMPLETED',
          },
        });
        return { deleted: del.count, id: snap.id };
      });
      replaced += result.deleted ? 1 : 0;
      imported.push({ id: result.id, month: file.month, metrics: r.metrics });
    }

    logger.info(`[ClarityCSV] Imported ${imported.length} month(s) for website ${websiteId}: ${imported.map((i) => i.month).join(', ')}`);
    return { imported: imported.sort((a, b) => a.month.localeCompare(b.month)), replaced };
  }

  async list(workspaceId, websiteId) {
    const website = await prisma.website.findFirst({ where: { id: websiteId, workspaceId }, select: { id: true } });
    if (!website) throw new NotFoundError('Website not found in this workspace.');
    const snaps = await prisma.clarityImportSnapshot.findMany({
      where: { websiteId, preset: CSV_PRESET },
      orderBy: { windowStart: 'desc' },
      select: { id: true, windowStart: true, dimensions: true, createdAt: true, rawResponseJson: true },
    });
    return {
      imports: snaps.map((s) => {
        let data = {};
        try {
          data = JSON.parse(s.rawResponseJson);
        } catch {
          /* ignore */
        }
        return {
          id: s.id,
          month: s.windowStart.toISOString().slice(0, 7),
          fileName: s.dimensions,
          importedAt: s.createdAt,
          metrics: data.metrics || {},
          pagesCount: data.pages?.length || 0,
        };
      }),
    };
  }

  async remove(workspaceId, websiteId, importId) {
    const snap = await prisma.clarityImportSnapshot.findFirst({
      where: { id: importId, websiteId, workspaceId, preset: CSV_PRESET },
      select: { id: true },
    });
    if (!snap) throw new NotFoundError('Import not found.');
    await prisma.clarityImportSnapshot.delete({ where: { id: snap.id } });
    return { deleted: true };
  }

  /** Map of YYYY-MM → metrics for months imported from CSV (used by Monthly Charts). */
  async monthlyMetrics(websiteId, startDate, endDate) {
    const snaps = await prisma.clarityImportSnapshot.findMany({
      where: {
        websiteId,
        preset: CSV_PRESET,
        windowStart: { lte: new Date(`${endDate}T23:59:59.999Z`) },
        windowEnd: { gte: new Date(`${startDate}T00:00:00.000Z`) },
      },
      select: { windowStart: true, rawResponseJson: true },
    });
    const out = new Map();
    for (const s of snaps) {
      try {
        out.set(s.windowStart.toISOString().slice(0, 7), JSON.parse(s.rawResponseJson).metrics || {});
      } catch {
        /* skip unreadable rows */
      }
    }
    return out;
  }
}

export const clarityCsvService = new ClarityCsvService();
export default clarityCsvService;
