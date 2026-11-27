// frontend/src/pages/charts/ChartsPage.jsx
// Month-by-month bar charts for one website, one data source at a time.
//
// GA4, Search Console and Clarity count visitors differently, so their numbers
// are never added together. "Compare tools" puts GA4 and Clarity users side by
// side instead, which is useful for spotting tracking gaps.

import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { BarChart4, Info, AlertTriangle, ArrowUpRight, ArrowDownRight, Minus, Download, Loader2, Upload, Plus, X } from 'lucide-react';
import ClarityCsvImportModal from '../../features/integrations/components/ClarityCsvImportModal.jsx';
import { selectActiveWorkspace } from '../../features/auth/authSlice.js';
import { useGetWebsitesQuery } from '../../features/websites/websitesApi.js';
import { useGetChartCatalogueQuery, useGetMonthlyChartQuery } from '../../features/analytics/analyticsApi.js';

const STORAGE_KEY = 'missive.charts.filters';

const SOURCE_COLORS = { ga4: '#2563eb', gsc: '#10b981', clarity: '#8b5cf6' };
const SOURCE_SHORT = { ga4: 'GA4', gsc: 'Search Console', clarity: 'Clarity' };

const SEGMENT_LABELS = {
  none: 'All traffic',
  device: 'Device',
  country: 'Country',
  medium: 'Traffic medium',
};

// Compare mode
const MAX_SERIES = 3;
const SERIES_COLORS = ['#2563eb', '#8b5cf6', '#10b981'];
const SERIES_LETTERS = ['A', 'B', 'C'];
const DEFAULT_COMPARE = [
  { source: 'ga4', segment: 'none', segmentValue: '', metric: 'totalUsers' },
  { source: 'clarity', segment: 'none', segmentValue: '', metric: 'distinctUsers' },
];

/** "GA4 · Users · mobile" from a monthly series response. */
function seriesLabel(meta) {
  const value = meta.segmentValue
    ? meta.source === 'gsc' && meta.segment === 'country'
      ? meta.segmentValue.toUpperCase()
      : meta.segmentValue
    : null;
  return [SOURCE_SHORT[meta.source], meta.metricLabel, value].filter(Boolean).join(' · ');
}

const SEGMENT_ALL_LABELS = {
  device: 'All devices',
  country: 'All countries',
  medium: 'All mediums',
};

const RANGE_PRESETS = [
  { id: '6m', label: '6 months' },
  { id: '12m', label: '12 months' },
  { id: '24m', label: '24 months' },
  { id: '36m', label: '36 months' },
  { id: '60m', label: '5 years' },
  { id: 'ytd', label: 'This year' },
  { id: 'last_year', label: 'Last year' },
  { id: 'custom', label: 'Custom' },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n) {
  return String(n).padStart(2, '0');
}
function toYmd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function lastDayOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${pad(new Date(y, m, 0).getDate())}`;
}
function monthLabel(ym, withYear = true) {
  const [y, m] = ym.split('-');
  return withYear ? `${MONTH_NAMES[Number(m) - 1]} ${y.slice(2)}` : MONTH_NAMES[Number(m) - 1];
}

/** Date range for a preset. Ranges end yesterday (the last complete day). */
function rangeFor(preset, customFrom, customTo) {
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const end = toYmd(yest);
  const monthsBack = (n) => {
    const d = new Date(yest.getFullYear(), yest.getMonth() - (n - 1), 1);
    return toYmd(d);
  };
  switch (preset) {
    case '6m':
      return { startDate: monthsBack(6), endDate: end };
    case '24m':
      return { startDate: monthsBack(24), endDate: end };
    case '36m':
      return { startDate: monthsBack(36), endDate: end };
    case '60m':
      return { startDate: monthsBack(60), endDate: end };
    case 'ytd':
      return { startDate: `${yest.getFullYear()}-01-01`, endDate: end };
    case 'last_year': {
      const y = yest.getFullYear() - 1;
      return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
    }
    case 'custom': {
      if (!customFrom || !customTo || customFrom > customTo) return rangeFor('12m');
      const to = lastDayOfMonth(customTo);
      return { startDate: `${customFrom}-01`, endDate: to < end ? to : end };
    }
    case '12m':
    default:
      return { startDate: monthsBack(12), endDate: end };
  }
}

const MONTH_INPUT_RE = /^(\d{4})-(\d{2})$/;

/** Why a custom From/To pair can't be used yet, or null when it's fine. */
function customRangeError(from, to) {
  if (!from || !to) return 'Pick both a From and a To month.';
  const f = from.match(MONTH_INPUT_RE);
  const t = to.match(MONTH_INPUT_RE);
  // While typing, Chrome reports years like 0002 or 0202: wait for a real one
  if (!f || !t || Number(f[1]) < 2000 || Number(t[1]) < 2000) return 'Enter a full year (e.g. 2026).';
  if (from > to) return 'From month must be on or before To month.';
  const span = (Number(t[1]) - Number(f[1])) * 12 + (Number(t[2]) - Number(f[2])) + 1;
  if (span > 120) return 'Choose 120 months (10 years) or fewer.';
  return null;
}

function formatValue(v, unit) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (unit === '%') return `${Number(v).toFixed(2)}%`;
  if (unit === 's') {
    const sec = Math.round(v);
    const m = Math.floor(sec / 60);
    return m > 0 ? `${m}m ${sec % 60}s` : `${sec}s`;
  }
  return Number.isInteger(v) ? v.toLocaleString() : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function compactAxis(v, unit) {
  if (unit === '%') return `${v}%`;
  if (unit === 's') return `${v}s`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v;
}

function pctChange(curr, prev) {
  if (curr === null || prev === null || prev === undefined || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function ChangeBadge({ value, lowerIsBetter }) {
  if (value === null || value === undefined) return <span className="text-surface-400">—</span>;
  const up = value > 0;
  const flat = Math.abs(value) < 0.05;
  const good = flat ? null : up !== lowerIsBetter;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const color = good === null ? 'text-surface-500' : good ? 'text-emerald-600' : 'text-rose-600';
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium ${color}`}>
      <Icon className="w-3.5 h-3.5" />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function StatTile({ label, value, sub }) {
  return (
    <div className="card p-4">
      <p className="text-2xs font-semibold uppercase tracking-wider text-surface-400">{label}</p>
      <p className="text-xl font-semibold text-surface-900 mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-surface-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function ChartTooltip({ active, payload, unit, units, series }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-surface-900 text-white text-xs rounded-lg p-2.5 shadow-lg border border-surface-800 min-w-[150px]">
      <div className="font-semibold text-surface-200 mb-1">{row.fullLabel}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-surface-300">
            <span className="w-2 h-2 rounded-sm" style={{ background: p.color || p.fill }} />
            {series?.[p.dataKey] || p.name}
          </span>
          <span className="font-mono font-bold">{formatValue(p.value, units ? units[p.dataKey] : unit)}</span>
        </div>
      ))}
      {row.partial && (
        <div className="text-2xs text-amber-300 mt-1">
          {units ? 'Includes an incomplete month' : `Partial month: ${row.daysWithData} of ${row.expectedDays} days`}
        </div>
      )}
    </div>
  );
}

function Select({ label, value, onChange, children, disabled }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-surface-700 mb-1.5">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input w-full" disabled={disabled}>
        {children}
      </select>
    </label>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ChartsPage() {
  const workspace = useSelector(selectActiveWorkspace);
  const workspaceId = workspace?.id;
  const saved = useMemo(loadSaved, []);

  const [websiteId, setWebsiteId] = useState(saved.websiteId || '');
  const [mode, setMode] = useState(saved.mode || 'single'); // 'single' | 'compare'
  const [source, setSource] = useState(saved.source || 'ga4');
  const [segment, setSegment] = useState(saved.segment || 'none');
  const [segmentValue, setSegmentValue] = useState('');
  const [metric, setMetric] = useState(saved.metric || 'totalUsers');
  const [preset, setPreset] = useState(saved.preset || '12m');
  const [clarityImportOpen, setClarityImportOpen] = useState(false);
  // Compare mode: 2–3 series, each with the same filters as Single source
  const [compareSeries, setCompareSeries] = useState(() =>
    Array.isArray(saved.compareSeries) && saved.compareSeries.length >= 2 ? saved.compareSeries.slice(0, MAX_SERIES) : DEFAULT_COMPARE
  );
  // Never open on empty custom months: fall back to the last 12 months
  const savedCustomOk = !customRangeError(saved.customFrom, saved.customTo);
  const [customFrom, setCustomFrom] = useState(savedCustomOk ? saved.customFrom : rangeFor('12m').startDate.slice(0, 7));
  const [customTo, setCustomTo] = useState(savedCustomOk ? saved.customTo : rangeFor('12m').endDate.slice(0, 7));

  const { data: websitesData, isLoading: websitesLoading } = useGetWebsitesQuery({ workspaceId }, { skip: !workspaceId });
  const websites = websitesData?.data || [];
  const { data: catalogueData } = useGetChartCatalogueQuery(workspaceId, { skip: !workspaceId });
  const catalogue = catalogueData?.data;

  // Default to the first website, or fix a remembered one that no longer exists
  useEffect(() => {
    if (websites.length && !websites.some((w) => w.id === websiteId)) setWebsiteId(websites[0].id);
  }, [websites, websiteId]);

  // Keep segment and metric valid for the chosen source
  const segments = catalogue?.[source]?.segments || {};
  const metrics = segments[segment] || {};
  useEffect(() => {
    if (!catalogue) return;
    if (!segments[segment]) {
      setSegment('none');
      return;
    }
    if (!metrics[metric]) setMetric(Object.keys(metrics)[0]);
  }, [catalogue, source, segment, metric]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ websiteId, mode, source, segment, metric, preset, customFrom, customTo, compareSeries })
    );
  }, [websiteId, mode, source, segment, metric, preset, customFrom, customTo, compareSeries]);

  /** Change one compare series, keeping its segment and metric valid for its source. */
  const updateSeries = (index, patch) =>
    setCompareSeries((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const next = { ...s, ...patch };
        const segs = catalogue?.[next.source]?.segments || {};
        if (!segs[next.segment]) next.segment = 'none';
        const mets = segs[next.segment] || {};
        if (!mets[next.metric]) next.metric = Object.keys(mets)[0] || next.metric;
        if (patch.source || patch.segment) next.segmentValue = patch.segmentValue ?? '';
        return next;
      })
    );

  // Custom months only apply once both are valid and you've stopped typing,
  // so half-typed years don't fire a burst of requests. Until then the chart
  // keeps the range it was already showing.
  const currentMonth = rangeFor('12m').endDate.slice(0, 7);
  const customError = preset === 'custom' ? customRangeError(customFrom, customTo) : null;
  const [appliedCustom, setAppliedCustom] = useState(() => ({ from: customFrom, to: customTo }));
  useEffect(() => {
    if (preset !== 'custom' || customError) return undefined;
    const t = setTimeout(() => setAppliedCustom({ from: customFrom, to: customTo }), 500);
    return () => clearTimeout(t);
  }, [preset, customFrom, customTo, customError]);

  const [lastRange, setLastRange] = useState(() => rangeFor('12m'));
  const { startDate, endDate } =
    preset !== 'custom'
      ? rangeFor(preset)
      : appliedCustom
        ? rangeFor('custom', appliedCustom.from, appliedCustom.to)
        : lastRange;
  useEffect(() => {
    if (preset !== 'custom') setLastRange(rangeFor(preset));
  }, [preset]);

  // Switching to Custom starts from the range already on screen
  const handlePresetChange = (next) => {
    if (next === 'custom' && preset !== 'custom') {
      const from = startDate.slice(0, 7);
      const to = endDate.slice(0, 7);
      setCustomFrom(from);
      setCustomTo(to);
      setAppliedCustom({ from, to });
    }
    setPreset(next);
  };

  const metricValid = !!metrics[metric];
  const skipSingle = !workspaceId || !websiteId || !metricValid || mode !== 'single';

  const single = useGetMonthlyChartQuery(
    { workspaceId, websiteId, source, metric, segment, segmentValue, startDate, endDate },
    { skip: skipSingle }
  );

  // One query per compare series (hooks can't be created in a loop, so a fixed 3)
  const seriesArgs = (i) => {
    const s = compareSeries[i];
    return s ? { workspaceId, websiteId, source: s.source, metric: s.metric, segment: s.segment, segmentValue: s.segmentValue, startDate, endDate } : {};
  };
  const seriesSkip = (i) => {
    const s = compareSeries[i];
    return !workspaceId || !websiteId || mode !== 'compare' || !s || !catalogue?.[s.source]?.segments?.[s.segment]?.[s.metric];
  };
  const q0 = useGetMonthlyChartQuery(seriesArgs(0), { skip: seriesSkip(0) });
  const q1 = useGetMonthlyChartQuery(seriesArgs(1), { skip: seriesSkip(1) });
  const q2 = useGetMonthlyChartQuery(seriesArgs(2), { skip: seriesSkip(2) });
  const seriesQueries = [q0, q1, q2].slice(0, compareSeries.length);

  const chart = useMemo(() => {
    if (mode === 'single') {
      const d = single.data?.data;
      if (!d) return null;
      const rows = d.series.map((p, i) => ({
        ...p,
        label: monthLabel(p.month),
        fullLabel: monthLabel(p.month).replace(' ', ' 20'),
        change: i > 0 ? pctChange(p.value, d.series[i - 1].value) : null,
      }));
      return { meta: d, rows };
    }
    const metas = seriesQueries.map((q) => q.data?.data);
    if (metas.some((m) => !m)) return null;
    const series = metas.map((m, i) => ({
      key: `s${i}`,
      meta: m,
      color: SERIES_COLORS[i],
      letter: SERIES_LETTERS[i],
      label: seriesLabel(m),
      unit: m.unit || null,
    }));
    // Second axis on the right for the first series whose unit differs from A's
    const rightUnit = series.find((s) => s.unit !== series[0].unit)?.unit;
    series.forEach((s) => {
      s.axis = rightUnit !== undefined && s.unit === rightUnit ? 'right' : 'left';
    });
    const byMonth = metas.map((m) => new Map(m.series.map((p) => [p.month, p])));
    const months = [...new Set(metas.flatMap((m) => m.series.map((p) => p.month)))].sort();
    const rows = months.map((month) => {
      const row = { month, label: monthLabel(month), fullLabel: monthLabel(month).replace(' ', ' 20') };
      series.forEach((s, i) => {
        const p = byMonth[i].get(month) || {};
        row[s.key] = p.value ?? null;
        row[`${s.key}Partial`] = !!p.partial;
        row[`${s.key}Csv`] = p.source === 'csv';
        row[`${s.key}Days`] = p.daysWithData || 0;
        row.expectedDays = p.expectedDays || row.expectedDays;
      });
      row.partial = series.some((s) => row[`${s.key}Partial`]);
      // Difference vs series A, only when both months are complete and share a unit
      series.slice(1).forEach((s) => {
        const a = row.s0;
        const b = row[s.key];
        row[`${s.key}VsA`] =
          s.unit === series[0].unit && a && b !== null && !row.s0Partial && !row[`${s.key}Partial`] ? ((b - a) / Math.abs(a)) * 100 : null;
      });
      return row;
    });
    return { meta: { compare: true, series, rightUnit }, rows };
  }, [mode, single.data, q0.data, q1.data, q2.data, compareSeries.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // First load shows a placeholder; later filter changes keep the previous
  // chart on screen (dimmed) until the new numbers arrive.
  const activeQueries = mode === 'single' ? [single] : seriesQueries;
  const isFetching = activeQueries.some((q) => q.isFetching);
  const isLoading = websitesLoading || (isFetching && !chart);
  const isUpdating = isFetching && !!chart;
  const error = isFetching ? null : activeQueries.find((q) => q.error)?.error;
  const hasData =
    chart &&
    chart.rows.some((r) => (mode === 'single' ? r.value !== null : chart.meta.series.some((s) => r[s.key] !== null)));

  // Summary tiles (single mode)
  const tiles = useMemo(() => {
    if (mode !== 'single' || !chart) return null;
    const { meta, rows } = chart;
    const withData = rows.filter((r) => r.value !== null);
    const complete = withData.filter((r) => !r.partial);
    const best = withData.reduce((m, r) => (m === null || (meta.lowerIsBetter ? r.value < m.value : r.value > m.value) ? r : m), null);
    const last = complete[complete.length - 1];
    const prev = complete[complete.length - 2];
    return {
      total: meta.stats.total,
      average: meta.stats.average,
      best,
      last,
      lastChange: last && prev ? pctChange(last.value, prev.value) : null,
    };
  }, [mode, chart]);

  const unit = mode === 'single' ? chart?.meta?.unit : null;
  const color = SOURCE_COLORS[source];

  const exportCsv = () => {
    if (!chart) return;
    const lines =
      mode === 'single'
        ? [['Month', chart.meta.metricLabel, 'Change vs previous month (%)', 'Days with data'].join(',')].concat(
            chart.rows.map((r) => [r.month, r.value ?? '', r.change === null ? '' : r.change.toFixed(2), r.daysWithData].join(','))
          )
        : [
            ['Month', ...chart.meta.series.map((s) => `"${s.letter}: ${s.label}"`), ...chart.meta.series.slice(1).filter((x) => x.unit === chart.meta.series[0].unit).map((s) => `"${s.letter} vs A (%)"`)].join(','),
          ].concat(
            chart.rows.map((r) =>
              [
                r.month,
                ...chart.meta.series.map((s) => r[s.key] ?? ''),
                ...chart.meta.series.slice(1).filter((x) => x.unit === chart.meta.series[0].unit).map((s) => (r[`${s.key}VsA`] === null ? '' : r[`${s.key}VsA`].toFixed(2))),
              ].join(',')
            )
          );
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const site = websites.find((w) => w.id === websiteId);
    a.download = `${site?.domain || 'website'}-${mode === 'single' ? `${source}-${metric}` : `compare-${compareSeries.map((s) => `${s.source}-${s.metric}`).join('-vs-')}`}-${startDate.slice(0, 7)}-to-${endDate.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-surface-900 flex items-center gap-2">
            <BarChart4 className="w-5 h-5 text-brand-600" />
            Monthly Charts
          </h1>
          <p className="text-sm text-surface-500 mt-1">
            Month-by-month performance from one tool at a time. Numbers from different tools are never added together.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setClarityImportOpen(true)}
            disabled={!websiteId}
            title="Upload monthly CSV downloads from the Clarity dashboard"
          >
            <Upload className="w-4 h-4" />
            Import Clarity history
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={!hasData}>
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <ClarityCsvImportModal
        isOpen={clarityImportOpen}
        onClose={() => setClarityImportOpen(false)}
        workspaceId={workspaceId}
        websiteId={websiteId}
        websiteName={websites.find((w) => w.id === websiteId)?.name}
      />

      {/* Filters */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-surface-200 p-0.5 bg-surface-50">
            {[
              ['single', 'Single source'],
              ['compare', 'Compare'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  mode === id ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === 'single' && (
            <div className="inline-flex rounded-lg border border-surface-200 p-0.5 bg-surface-50">
              {['ga4', 'gsc', 'clarity'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSource(s);
                    setSegmentValue('');
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                    source === s ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-800'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: SOURCE_COLORS[s] }} />
                  {SOURCE_SHORT[s]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Select label="Website" value={websiteId} onChange={setWebsiteId} disabled={!websites.length}>
            {!websites.length && <option value="">No websites yet</option>}
            {websites.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.domain})
              </option>
            ))}
          </Select>

          {mode === 'single' && (
            <>
              <Select label="Metric" value={metricValid ? metric : ''} onChange={setMetric}>
                {Object.entries(metrics).map(([k, m]) => (
                  <option key={k} value={k}>
                    {m.label}
                  </option>
                ))}
              </Select>

              <Select
                label="Segment by"
                value={segment}
                onChange={(v) => {
                  setSegment(v);
                  setSegmentValue('');
                }}
                disabled={Object.keys(segments).length < 2}
              >
                {Object.keys(segments).map((k) => (
                  <option key={k} value={k}>
                    {SEGMENT_LABELS[k] || k}
                  </option>
                ))}
              </Select>

              {segment !== 'none' && (
                <Select label={SEGMENT_LABELS[segment]} value={segmentValue} onChange={setSegmentValue}>
                  <option value="">{SEGMENT_ALL_LABELS[segment] || 'All'}</option>
                  {(single.data?.data?.segmentOptions || []).map((o) => (
                    <option key={o} value={o}>
                      {source === 'gsc' && segment === 'country' ? o.toUpperCase() : o}
                    </option>
                  ))}
                </Select>
              )}
            </>
          )}

          <Select label="Period" value={preset} onChange={handlePresetChange}>
            {RANGE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>

          {preset === 'custom' && (
            <div className="sm:col-span-2 lg:col-span-5">
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <label className="block">
                  <span className="block text-xs font-medium text-surface-700 mb-1.5">From month</span>
                  <input
                    type="month"
                    className={`input w-full ${customError ? 'input-error' : ''}`}
                    value={customFrom}
                    max={currentMonth}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-surface-700 mb-1.5">To month</span>
                  <input
                    type="month"
                    className={`input w-full ${customError ? 'input-error' : ''}`}
                    value={customTo}
                    max={currentMonth}
                    onChange={(e) => setCustomTo(e.target.value)}
                  />
                </label>
              </div>
              {customError && <p className="text-2xs text-rose-600 mt-1">{customError}</p>}
            </div>
          )}
        </div>

        {/* Compare: each series has the same filters as Single source */}
        {mode === 'compare' && (
          <div className="space-y-3 pt-1">
            {compareSeries.map((s, i) => {
              const segs = catalogue?.[s.source]?.segments || {};
              const mets = segs[s.segment] || {};
              const options = seriesQueries[i]?.data?.data?.segmentOptions || [];
              return (
                <div key={i} className="rounded-xl border border-surface-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-2 text-xs font-semibold text-surface-700">
                      <span className="w-3 h-3 rounded-sm" style={{ background: SERIES_COLORS[i] }} />
                      Series {SERIES_LETTERS[i]}
                    </span>
                    {compareSeries.length > 2 && (
                      <button
                        type="button"
                        className="p-1 text-surface-400 hover:text-rose-600"
                        title="Remove this series"
                        onClick={() => setCompareSeries((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Select label="Source" value={s.source} onChange={(v) => updateSeries(i, { source: v })}>
                      {['ga4', 'gsc', 'clarity'].map((src) => (
                        <option key={src} value={src}>
                          {SOURCE_SHORT[src]}
                        </option>
                      ))}
                    </Select>
                    <Select label="Metric" value={mets[s.metric] ? s.metric : ''} onChange={(v) => updateSeries(i, { metric: v })}>
                      {Object.entries(mets).map(([k, m]) => (
                        <option key={k} value={k}>
                          {m.label}
                        </option>
                      ))}
                    </Select>
                    <Select
                      label="Segment by"
                      value={s.segment}
                      onChange={(v) => updateSeries(i, { segment: v })}
                      disabled={Object.keys(segs).length < 2}
                    >
                      {Object.keys(segs).map((k) => (
                        <option key={k} value={k}>
                          {SEGMENT_LABELS[k] || k}
                        </option>
                      ))}
                    </Select>
                    {s.segment !== 'none' && (
                      <Select label={SEGMENT_LABELS[s.segment]} value={s.segmentValue} onChange={(v) => updateSeries(i, { segmentValue: v })}>
                        <option value="">{SEGMENT_ALL_LABELS[s.segment] || 'All'}</option>
                        {options.map((o) => (
                          <option key={o} value={o}>
                            {s.source === 'gsc' && s.segment === 'country' ? o.toUpperCase() : o}
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-2">
              {compareSeries.length < MAX_SERIES && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setCompareSeries((prev) => [...prev, { source: 'gsc', segment: 'none', segmentValue: '', metric: 'clicks' }])}
                >
                  <Plus className="w-4 h-4" />
                  Add series
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCompareSeries(DEFAULT_COMPARE)}>
                Reset to GA4 vs Clarity users
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notes about how numbers are counted */}
      {mode === 'single' && chart?.meta?.usersMethod === 'ga4_monthly_unique' && (
        <div className="flex gap-2 text-xs text-surface-600 bg-brand-50 border border-brand-100 rounded-lg p-3">
          <Info className="w-4 h-4 text-brand-600 flex-shrink-0 mt-0.5" />
          Unique users per month, fetched from GA4. A visitor who comes back on several days counts once per month.
        </div>
      )}
      {mode === 'single' && chart?.meta?.usersMethod === 'sum_of_daily' && (
        <div className="flex gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          These bars add up daily user counts, so a visitor who comes on 5 days counts 5 times. Read them as a trend, not as
          unique visitors.
          {chart.meta.csvMonths > 0 && ' Months marked "CSV" use Clarity’s own monthly figures from an imported dashboard download.'}
        </div>
      )}
      {mode === 'single' && chart?.meta?.csvMonths > 0 && chart.meta.usersMethod !== 'sum_of_daily' && (
        <div className="flex gap-2 text-xs text-surface-600 bg-brand-50 border border-brand-100 rounded-lg p-3">
          <Info className="w-4 h-4 text-brand-600 flex-shrink-0 mt-0.5" />
          {chart.meta.csvMonths} month{chart.meta.csvMonths === 1 ? '' : 's'} marked &quot;CSV&quot; come from Clarity dashboard
          downloads you imported.
        </div>
      )}
      {mode === 'compare' && chart?.meta?.compare && (
        <div className="flex gap-2 text-xs text-surface-600 bg-surface-50 border border-surface-200 rounded-lg p-3">
          <Info className="w-4 h-4 text-surface-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>Each series is shown side by side, never added together.</p>
            {new Set(chart.meta.series.map((s) => s.meta.source)).size > 1 &&
              chart.meta.series.some((s) => s.meta.usersMethod) && (
                <p>
                  Different tools identify visitors differently, so their user counts never match exactly. A sudden gap usually
                  means one tracking code stopped firing on some pages.
                </p>
              )}
            {chart.meta.series
              .filter((s) => s.meta.usersMethod === 'sum_of_daily')
              .map((s) => (
                <p key={s.key}>
                  Series {s.letter} adds up daily user counts, so a visitor on 5 days counts 5 times.
                </p>
              ))}
            {chart.meta.rightUnit !== undefined && (
              <p>Series with a different unit ({chart.meta.rightUnit || 'counts'}) use the axis on the right.</p>
            )}
          </div>
        </div>
      )}

      <div className="relative space-y-6">
      {/* Loader shown over the old results while new ones load */}
      {isUpdating && (
        <div className="absolute inset-0 z-10 flex justify-center rounded-xl bg-white/80 backdrop-blur-[2px]">
          <div className="sticky top-1/3 mt-24 h-fit flex items-center gap-2.5 rounded-lg border border-surface-200 bg-white px-4 py-3 shadow-dropdown">
            <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
            <span className="text-sm font-medium text-surface-700">Loading data…</span>
          </div>
        </div>
      )}

      {/* Summary tiles */}
      {tiles && hasData && (
        <div className={`grid grid-cols-2 gap-4 ${tiles.total !== null ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
          {tiles.total !== null && (
            <StatTile label="Total for period" value={formatValue(tiles.total, unit)} sub={chart.meta.metricLabel} />
          )}
          <StatTile
            label="Monthly average"
            value={formatValue(tiles.average, unit)}
            sub={
              chart.meta.usersMethod === 'ga4_monthly_unique'
                ? 'Unique users can’t be totalled across months'
                : `${chart.meta.stats.monthsWithData} months with data`
            }
          />
          <StatTile label={chart.meta.lowerIsBetter ? 'Best month (lowest)' : 'Best month'} value={tiles.best ? formatValue(tiles.best.value, unit) : '—'} sub={tiles.best?.fullLabel} />
          <StatTile
            label="Last full month"
            value={tiles.last ? formatValue(tiles.last.value, unit) : '—'}
            sub={
              tiles.last ? (
                <span className="inline-flex items-center gap-1">
                  {tiles.last.fullLabel} · <ChangeBadge value={tiles.lastChange} lowerIsBetter={chart.meta.lowerIsBetter} /> vs prior
                </span>
              ) : null
            }
          />
        </div>
      )}

      {/* Summary tiles (compare): one per series */}
      {mode === 'compare' && chart?.meta?.compare && hasData && (
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${chart.meta.series.length === 3 ? 'lg:grid-cols-3' : ''}`}>
          {chart.meta.series.map((s) => {
            const complete = chart.rows.filter((r) => r[s.key] !== null && !r[`${s.key}Partial`]);
            const last = complete[complete.length - 1];
            const prev = complete[complete.length - 2];
            return (
              <div key={s.key} className="card p-4">
                <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-surface-400">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                  Series {s.letter}
                </p>
                <p className="text-xs text-surface-600 mt-0.5 truncate" title={s.label}>
                  {s.label}
                </p>
                <p className="text-xl font-semibold text-surface-900 mt-1 tabular-nums">{formatValue(s.meta.stats.average, s.unit)}</p>
                <p className="text-xs text-surface-500">
                  monthly average
                  {last && (
                    <span className="inline-flex items-center gap-1 ml-1">
                      · {last.fullLabel}: {formatValue(last[s.key], s.unit)}{' '}
                      <ChangeBadge value={prev ? pctChange(last[s.key], prev[s.key]) : null} lowerIsBetter={s.meta.lowerIsBetter} />
                    </span>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Chart */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-surface-900">
            {mode === 'single'
              ? `${chart?.meta?.metricLabel || 'Metric'} by month · ${SOURCE_SHORT[source]}${segmentValue ? ` · ${source === 'gsc' && segment === 'country' ? segmentValue.toUpperCase() : segmentValue}` : ''}`
              : `Compare by month${chart?.meta?.compare ? ` · ${chart.meta.series.map((s) => s.letter).join(' vs ')}` : ''}`}
          </h2>
          <span className="text-xs text-surface-400">
            {startDate} → {endDate}
          </span>
        </div>

        <div>
        {isLoading ? (
          <div className="h-[360px] rounded-xl bg-surface-50 flex items-center justify-center gap-2.5 text-sm text-surface-500">
            <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
            Loading data…
          </div>
        ) : error ? (
          <div className="h-[360px] flex items-center justify-center text-sm text-rose-600">
            {error?.data?.error?.message || error?.data?.message || 'Could not load chart data.'}
          </div>
        ) : !hasData ? (
          <div className="h-[360px] flex flex-col items-center justify-center border border-dashed border-surface-200 rounded-xl bg-surface-50/50 text-surface-400 text-sm gap-1">
            <span>No data for this period.</span>
            <span className="text-xs">Check that this tool is connected and synced for the selected website.</span>
          </div>
        ) : (
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis
                  yAxisId="left"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => compactAxis(v, mode === 'single' ? unit : chart.meta.series[0].unit)}
                  width={48}
                />
                {mode === 'compare' && chart.meta.rightUnit !== undefined && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => compactAxis(v, chart.meta.rightUnit)}
                    width={48}
                  />
                )}
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  content={
                    mode === 'single' ? (
                      <ChartTooltip unit={unit} series={{ value: chart.meta.metricLabel }} />
                    ) : (
                      <ChartTooltip
                        units={Object.fromEntries(chart.meta.series.map((s) => [s.key, s.unit]))}
                        series={Object.fromEntries(chart.meta.series.map((s) => [s.key, `${s.letter}: ${s.label}`]))}
                      />
                    )
                  }
                />
                {mode === 'single' ? (
                  <Bar yAxisId="left" dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {chart.rows.map((r) => (
                      <Cell key={r.month} fill={color} fillOpacity={r.partial ? 0.45 : 1} />
                    ))}
                  </Bar>
                ) : (
                  <>
                    <Legend
                      iconType="square"
                      iconSize={10}
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(v) => {
                        const s = chart.meta.series.find((x) => x.key === v);
                        return s ? `${s.letter}: ${s.label}` : v;
                      }}
                    />
                    {chart.meta.series.map((s) => (
                      <Bar key={s.key} yAxisId={s.axis} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={32}>
                        {chart.rows.map((r) => (
                          <Cell key={r.month} fill={s.color} fillOpacity={r[`${s.key}Partial`] ? 0.45 : 1} />
                        ))}
                      </Bar>
                    ))}
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        </div>
        {hasData && chart.rows.some((r) => r.partial) && (
          <p className="flex items-center gap-1.5 text-2xs text-surface-500 mt-2">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: mode === 'single' ? color : SERIES_COLORS[0], opacity: 0.45 }} />
            Lighter bar = incomplete month, e.g. the current month so far or a month with sync gaps. Not loading.
          </p>
        )}
      </div>

      {/* Data table */}
      {hasData && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-50 text-xs text-surface-500 uppercase tracking-wider">
              {mode === 'single' ? (
                <tr>
                  <th className="text-left font-semibold px-5 py-2.5">Month</th>
                  <th className="text-right font-semibold px-5 py-2.5">{chart.meta.metricLabel}</th>
                  <th className="text-right font-semibold px-5 py-2.5">vs previous month</th>
                  <th className="text-right font-semibold px-5 py-2.5">Days with data</th>
                </tr>
              ) : (
                <tr>
                  <th className="text-left font-semibold px-5 py-2.5">Month</th>
                  {chart.meta.series.map((s) => (
                    <th key={s.key} className="text-right font-semibold px-5 py-2.5" title={s.label}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
                        {s.letter}
                      </span>
                      <span className="block text-[10px] font-normal normal-case text-surface-400 max-w-[180px] truncate ml-auto">{s.label}</span>
                    </th>
                  ))}
                  {chart.meta.series.slice(1).filter((x) => x.unit === chart.meta.series[0].unit).map((s) => (
                    <th key={`${s.key}-vs`} className="text-right font-semibold px-5 py-2.5">
                      {s.letter} vs A
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-surface-100">
              {[...chart.rows].reverse().map((r) =>
                mode === 'single' ? (
                  <tr key={r.month} className="hover:bg-surface-50/60">
                    <td className="px-5 py-2.5 text-surface-800">
                      {r.fullLabel}
                      {r.partial && <span className="badge-yellow ml-2">Partial</span>}
                      {r.source === 'csv' && (
                        <span className="badge-blue ml-2" title="From an imported Clarity dashboard CSV">
                          CSV
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-medium">{formatValue(r.value, unit)}</td>
                    <td className="px-5 py-2.5 text-right text-xs">
                      <ChangeBadge value={r.change} lowerIsBetter={chart.meta.lowerIsBetter} />
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-surface-500 text-xs">
                      {r.daysWithData} / {r.expectedDays}
                    </td>
                  </tr>
                ) : (
                  <tr key={r.month} className="hover:bg-surface-50/60">
                    <td className="px-5 py-2.5 text-surface-800">{r.fullLabel}</td>
                    {chart.meta.series.map((s) => (
                      <td key={s.key} className="px-5 py-2.5 text-right tabular-nums">
                        {formatValue(r[s.key], s.unit)}
                        {r[`${s.key}Csv`] && <span className="badge-blue ml-1.5">CSV</span>}
                        {r[`${s.key}Partial`] && (
                          <span className="block text-2xs text-amber-600">
                            {r[`${s.key}Days`] >= r.expectedDays ? 'month so far' : `${r[`${s.key}Days`]} of ${r.expectedDays} days`}
                          </span>
                        )}
                      </td>
                    ))}
                    {chart.meta.series.slice(1).filter((x) => x.unit === chart.meta.series[0].unit).map((s) => {
                      const v = r[`${s.key}VsA`];
                      return (
                        <td key={`${s.key}-vs`} className="px-5 py-2.5 text-right tabular-nums text-xs text-surface-500">
                          {v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                        </td>
                      );
                    })}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  );
}
