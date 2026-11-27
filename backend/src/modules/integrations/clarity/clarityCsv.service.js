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
const MAX_FILES = 120; // 10 years of monthly downloads in one go
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

// Section names in Clarity's dashboard download ("Metric","<section>")
const SECTION_AVERAGE = { pagespersession: 'pagesPerSession', scrolldepth: 'avgScrollDepth' };
const SECTION_LISTS = {
  toppages: 'pages',
  popularpages: 'pages',
  pages: 'pages',
  browsers: 'browsers',
  browser: 'browsers',
  referrer: 'referrers',
  referrers: 'referrers',
  smartevents: 'smartEvents',
  devices: 'devices',
  device: 'devices',
  countries: 'countries',
  country: 'countries',
  countryregion: 'countries',
  operatingsystems: 'operatingSystems',
  operatingsystem: 'operatingSystems',
};

/**
 * True for an import saved before multi-month files were refused: one total
 * covering several months must never be shown as a single month.
 */
function spansSeveralMonths(payload) {
  const r = payload?.dateRange;
  return Boolean(r?.start && r?.end && r.start.slice(0, 7) !== r.end.slice(0, 7));
}

// Column headers that hold the row's date or month in a trend export
const DATE_HEADERS = ['date', 'day', 'daterange', 'time', 'datetime', 'month', 'period', 'timestamp'];

/**
 * A row's period cell → { month: 'YYYY-MM', date?: 'YYYY-MM-DD' }.
 * Accepts full dates ("2026-10-05", "10/5/2026", "Oct 5, 2026") or months
 * ("2026-10", "Oct 2026", "October 2026", "10/2026").
 */
function readPeriodCell(cell) {
  const s = String(cell ?? '').trim();
  if (!s) return null;
  const d = findDates(s)[0];
  if (d) return { month: d.slice(0, 7), date: d };
  let m = s.match(/^(20\d{2})[-/.](0?[1-9]|1[0-2])$/);
  if (m) return { month: `${m[1]}-${pad(+m[2])}` };
  m = s.match(/^(0?[1-9]|1[0-2])[-/.](20\d{2})$/);
  if (m) return { month: `${m[2]}-${pad(+m[1])}` };
  m = s.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s,-]*(20\d{2})$/i);
  if (m) return { month: `${m[2]}-${pad(MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase()) + 1)}` };
  return null;
}

function monthsSpanned(fromYm, toYm) {
  const [y1, m1] = fromYm.split('-').map(Number);
  const [y2, m2] = toYm.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

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

  // A0) Clarity's own dashboard download is a list of sections:
  //   "Metric","Scroll depth"            ← section header
  //   "","Average","46.31"               ← blank, label, value[, % of sessions]
  //   "Metric","Top pages","No. of sessions"
  //   "","https://site/page/","2966"
  const lists = { pages: [], devices: [], countries: [], browsers: [], referrers: [], smartEvents: [], operatingSystems: [] };
  let section = null;
  for (const r of rows) {
    if (norm(r[0]) === 'metric') {
      section = norm(r[1]);
      continue;
    }
    if (!section) continue;
    if (r[0] !== '') {
      // "Bot traffic" rows are written as key,value without the leading blank
      if (section === 'bottraffic' && r[0] !== '__typename') {
        const n = readNumber(r[1]);
        if (n) (extras.botTypes ||= {})[r[0]] = n.value;
      }
      continue;
    }
    const label = r[1];
    const key = norm(label);
    if (!label) continue;
    if (SECTION_AVERAGE[section] && ['average', 'avg', 'value'].includes(key)) {
      setMetric(SECTION_AVERAGE[section], r[2], 'section');
    } else if (section === 'activetimespent' && key === 'totaltime') {
      const d = readDuration(r[2]);
      if (d !== null) extras.totalTimeSec = d;
    } else if (section === 'usersoverview' && key === 'sessionswithnewusers') {
      extras.newUserSessions = readNumber(r[2])?.value ?? null;
    } else if (section === 'usersoverview' && key === 'sessionswithreturningusers') {
      extras.returningUserSessions = readNumber(r[2])?.value ?? null;
    } else if (section === 'javascripterrors' && key.includes('totaljavascripterrors')) {
      setMetric('scriptErrorCount', r[2], 'section');
    } else if (section === 'performanceoverview') {
      (extras.performance ||= {})[label] = r[2];
    } else if (SECTION_LISTS[section]) {
      const list = lists[SECTION_LISTS[section]];
      const n = readNumber(r[2]);
      if (n && list.length < MAX_LIST_ROWS) {
        list.push({ name: String(label).slice(0, 500), sessions: Math.round(n.value), pct: readNumber(r[3])?.value ?? null });
      }
    }
  }

  // A) Tables whose header row names metrics (optionally one row per date)
  const consumedRows = new Set();
  // A table with a date (or month) on every row is split into months, so one
  // file can cover a whole year: { 'YYYY-MM': { metrics, days, granularity } }
  const byMonth = new Map();
  const periodDates = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const header = rows[i];
    const cols = header.map((c, idx) => ({ idx, metric: KEY_TO_METRIC.get(norm(c)) })).filter((c) => c.metric);
    const dateCol = header.findIndex((c) => DATE_HEADERS.includes(norm(c)));
    // Metric tables need 2+ metric columns; a dated trend needs just one
    if (cols.length < (dateCol >= 0 ? 1 : 2)) continue;
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
      // Group rows by month: add counts, weight rates by sessions
      const sessIdx = cols.find((c) => c.metric === 'sessions')?.idx;
      const groups = new Map();
      for (const r of dataRows) {
        const when = readPeriodCell(r[dateCol]);
        if (!when) continue;
        if (when.date) periodDates.push(when.date);
        if (!groups.has(when.month)) groups.set(when.month, { rows: [], days: new Set(), granularity: when.date ? 'day' : 'month' });
        const g = groups.get(when.month);
        g.rows.push(r);
        if (when.date) g.days.add(when.date);
      }
      const aggregate = (groupRows) => {
        const out = {};
        for (const c of cols) {
          const kind = METRICS[c.metric].kind;
          let sum = 0;
          let wsum = 0;
          let wtot = 0;
          let n = 0;
          for (const r of groupRows) {
            const v = kind === 'duration' ? readDuration(r[c.idx]) : readNumber(r[c.idx])?.value;
            if (v === null || v === undefined) continue;
            const w = sessIdx !== undefined ? readNumber(r[sessIdx])?.value || 0 : 1;
            sum += v;
            wsum += v * w;
            wtot += w;
            n += 1;
          }
          if (!n) continue;
          out[c.metric] = kind === 'count' ? Math.round(sum) : wtot ? Math.round((wsum / wtot) * 100) / 100 : null;
        }
        return out;
      };
      for (const [ym, g] of groups) {
        const prev = byMonth.get(ym);
        const m = aggregate(g.rows);
        byMonth.set(ym, { metrics: { ...(prev?.metrics || {}), ...m }, days: g.days, granularity: g.granularity });
      }
      // Whole-file totals too (used when the file holds a single month)
      const totalsAll = aggregate(dataRows.filter((r) => readPeriodCell(r[dateCol])));
      for (const [k, v] of Object.entries(totalsAll)) {
        if (metrics[k] === undefined) {
          metrics[k] = v;
          metrics[`__from_${k}`] = 'dated table';
        }
      }
      const dayLevel = [...groups.values()].some((g) => g.granularity === 'day');
      if (dayLevel && cols.some((c) => c.metric === 'distinctUsers')) {
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

  // C) Lists in other layouts (header row + rows): pages, devices, countries
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

  // D) Month: the file's "Date range" row if it has one, otherwise any dates
  //    in the file (ignoring "exported on" style rows), otherwise the file name
  const errors = [];
  const dates = [];
  const rangeRow = rows.find((r) => norm(r[0]) === 'daterange');
  if (rangeRow) {
    for (const cell of rangeRow.slice(1)) dates.push(...findDates(cell));
  } else {
    for (const r of rows) {
      // Skip "Exported on, 2026-11-27" style rows: that's the download date
      if (r.some((cell) => /export|download|generated|created|printed/i.test(cell))) continue;
      for (const cell of r) dates.push(...findDates(cell));
    }
  }
  dates.sort();
  let month = null;
  let monthSource = null;
  let dateRange = null;
  let multiMonth = false;
  let split = [];
  const currentMonth = new Date().toISOString().slice(0, 7);
  const toPct = (m) => {
    const out = { ...m };
    if (out.avgScrollDepth !== undefined && out.avgScrollDepth > 0 && out.avgScrollDepth <= 1) {
      out.avgScrollDepth = Math.round(out.avgScrollDepth * 10000) / 100;
    }
    return out;
  };

  if (byMonth.size >= 2) {
    // A dated trend covering several months: one entry per month
    split = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, g]) => {
        const expected = daysInMonth(ym);
        const dayLevel = g.granularity === 'day';
        const sortedDays = [...g.days].sort();
        return {
          month: ym,
          metrics: toPct(g.metrics),
          granularity: g.granularity,
          days: dayLevel ? g.days.size : expected,
          expectedDays: expected,
          dateRange: dayLevel
            ? { start: sortedDays[0], end: sortedDays[sortedDays.length - 1] }
            : { start: `${ym}-01`, end: `${ym}-${pad(expected)}` },
          partial: (dayLevel && g.days.size < expected) || ym === currentMonth,
          future: ym > currentMonth,
        };
      });
    const future = split.filter((s) => s.future);
    if (future.length) warnings.push(`${future.length} month(s) after this month will be skipped.`);
    split = split.filter((s) => !s.future);
    const partial = split.filter((s) => s.partial).map((s) => s.month);
    if (partial.length) warnings.push(`Partial month(s): ${partial.join(', ')} (not every day is in the file).`);
    periodDates.sort();
    dateRange = periodDates.length
      ? { start: periodDates[0], end: periodDates[periodDates.length - 1] }
      : { start: `${split[0].month}-01`, end: `${split[split.length - 1].month}-${pad(daysInMonth(split[split.length - 1].month))}` };
    monthSource = 'rows';
  } else if (dates.length) {
    dateRange = { start: dates[0], end: dates[dates.length - 1] };
    const startMonth = dateRange.start.slice(0, 7);
    const endMonth = dateRange.end.slice(0, 7);
    if (startMonth !== endMonth) {
      // One total for several months can't be split into months
      multiMonth = true;
      const span = monthsSpanned(startMonth, endMonth);
      errors.push(
        `This file is one total for ${dateRange.start} to ${dateRange.end} (${span} months), with no date on each row, so it can't be split into months. Either download one month at a time (e.g. 1–31 Oct 2026), or use a Clarity export that has a date on every row (a day-by-day or month-by-month trend), which is split automatically.`
      );
    } else {
      month = startMonth;
      monthSource = 'content';
      const full = dateRange.start === `${month}-01` && dateRange.end === `${month}-${pad(daysInMonth(month))}`;
      if (!full) {
        warnings.push(`This file covers ${dateRange.start} to ${dateRange.end}, only part of the month, so it'll be saved as a partial month.`);
      }
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
    browsers: lists.browsers,
    referrers: lists.referrers,
    smartEvents: lists.smartEvents,
    operatingSystems: lists.operatingSystems,
    month,
    monthSource,
    dateRange,
    multiMonth,
    // Months found in a dated trend (one file → many months); empty otherwise
    split,
    partialMonth: Boolean(month && dateRange && !(dateRange.start === `${month}-01` && dateRange.end === `${month}-${pad(daysInMonth(month))}`)),
    errors,
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
          multiMonth: r.multiMonth,
          partialMonth: r.partialMonth,
          split: r.split.map((s) => ({ month: s.month, metrics: s.metrics, days: s.days, expectedDays: s.expectedDays, partial: s.partial })),
          errors: r.errors,
          warnings: r.warnings,
        };
      }),
    };
  }

  async import(workspaceId, websiteId, files, user) {
    checkFiles(files);
    const clarityConnectionId = await this.getClarityLink(workspaceId, websiteId);
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Every month to save: one per single-month file, or one per month found
    // in a file with dated rows (a whole year can come from one file)
    const entries = [];
    for (const f of files) {
      const r = extractClarityCsv(f.content, f.name);
      if (r.split.length) {
        for (const s of r.split) {
          entries.push({
            file: f,
            month: s.month,
            payload: {
              metrics: s.metrics,
              extras: {},
              // Page/device lists in the file are totals for the whole file, not per month
              pages: [],
              devices: [],
              countries: [],
              dateRange: s.dateRange,
              partialMonth: s.partial,
              splitFrom: { fileName: f.name, dateRange: r.dateRange, granularity: s.granularity },
              warnings: r.warnings,
            },
          });
        }
        continue;
      }
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(f.month || '')) throw new BadRequestError(`Pick a month for ${f.name}.`);
      if (f.month > currentMonth) throw new BadRequestError(`${f.name} is set to ${f.month}, which is in the future.`);
      if (r.multiMonth) throw new BadRequestError(`${f.name}: ${r.errors[0]}`);
      if (r.month && r.monthSource === 'content' && r.month !== f.month) {
        throw new BadRequestError(`${f.name} contains data for ${r.month}, but it's set to ${f.month}. Its month comes from the file's date range.`);
      }
      if (!r.metricsFound) throw new BadRequestError(`No Clarity metrics were recognised in ${f.name}.`);
      entries.push({
        file: f,
        month: f.month,
        payload: {
          metrics: r.metrics,
          extras: r.extras,
          pages: r.pages,
          devices: r.devices,
          countries: r.countries,
          browsers: r.browsers,
          referrers: r.referrers,
          smartEvents: r.smartEvents,
          operatingSystems: r.operatingSystems,
          dateRange: r.dateRange,
          partialMonth: r.partialMonth,
          warnings: r.warnings,
        },
      });
    }

    const seen = new Map();
    for (const e of entries) {
      if (seen.has(e.month)) {
        throw new BadRequestError(`${e.month} appears in both ${seen.get(e.month)} and ${e.file.name}. Keep one file per month.`);
      }
      seen.set(e.month, e.file.name);
    }
    if (!entries.length) throw new BadRequestError('No months to import were found in these files.');

    let replaced = 0;
    const imported = [];
    for (const { file: entryFile, month, payload: data } of entries) {
      const file = { ...entryFile, month };
      const r = { pages: data.pages, metrics: data.metrics };
      const windowStart = new Date(`${file.month}-01T00:00:00.000Z`);
      const windowEnd = new Date(`${file.month}-${pad(daysInMonth(file.month))}T23:59:59.999Z`);
      const payload = {
        source: 'clarity_dashboard_csv',
        month: file.month,
        fileName: file.name,
        importedAt: new Date().toISOString(),
        importedBy: user?.id || null,
        ...data,
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
          dateRange: data.dateRange || null,
          // Saved before multi-month files were refused; ignored by charts and reports
          notUsed: spansSeveralMonths(data),
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

  /**
   * Imported months that lie entirely inside [startDate, endDate], with the
   * exact dates each one covers (used by the report and the Clarity tab).
   */
  async importsWithinRange(websiteId, startDate, endDate) {
    const snaps = await prisma.clarityImportSnapshot.findMany({
      where: {
        websiteId,
        preset: CSV_PRESET,
        windowStart: { lte: new Date(`${endDate}T23:59:59.999Z`) },
        windowEnd: { gte: new Date(`${startDate}T00:00:00.000Z`) },
      },
      orderBy: { windowStart: 'asc' },
      select: { windowStart: true, rawResponseJson: true },
    });
    const out = [];
    for (const s of snaps) {
      let d;
      try {
        d = JSON.parse(s.rawResponseJson);
      } catch {
        continue;
      }
      if (spansSeveralMonths(d)) continue;
      const month = s.windowStart.toISOString().slice(0, 7);
      const from = d.dateRange?.start && d.dateRange.start.startsWith(month) ? d.dateRange.start : `${month}-01`;
      const to = d.dateRange?.end && d.dateRange.end.startsWith(month) ? d.dateRange.end : `${month}-${pad(daysInMonth(month))}`;
      if (from < startDate || to > endDate) continue; // only whole imported periods count
      out.push({ month, from, to, partialMonth: !!d.partialMonth, metrics: d.metrics || {}, extras: d.extras || {}, pages: d.pages || [], devices: d.devices || [], countries: d.countries || [] });
    }
    return out;
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
        const d = JSON.parse(s.rawResponseJson);
        if (spansSeveralMonths(d)) continue;
        out.set(s.windowStart.toISOString().slice(0, 7), d.metrics || {});
      } catch {
        /* skip unreadable rows */
      }
    }
    return out;
  }
}

export const clarityCsvService = new ClarityCsvService();
export default clarityCsvService;
