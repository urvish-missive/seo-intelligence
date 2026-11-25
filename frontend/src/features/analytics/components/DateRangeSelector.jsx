// frontend/src/features/analytics/components/DateRangeSelector.jsx
// Quick date tabs + custom range. The last choice is remembered (localStorage)
// so every dashboard opens on the period you were looking at.
import React, { useEffect, useState } from 'react';
import { Calendar, CheckSquare, Square } from 'lucide-react';

const STORAGE_KEY = 'missive.analytics.dateRange';

export const DATE_PRESETS = [
  { id: 'last_7_days', label: '7D', title: 'Last 7 days' },
  { id: 'last_28_days', label: '28D', title: 'Last 28 days' },
  { id: 'last_3_months', label: '3M', title: 'Last 3 months' },
  { id: 'last_6_months', label: '6M', title: 'Last 6 months' },
  { id: 'last_12_months', label: '12M', title: 'Last 12 months' },
  { id: 'this_month', label: 'This month', title: 'Month to date' },
  { id: 'last_month', label: 'Last month', title: 'Previous calendar month' },
  { id: 'custom', label: 'Custom', title: 'Pick your own dates' },
];

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/** Date range for a preset. Ranges end yesterday (the last complete day). */
export function calculateDatesForPreset(presetId) {
  const yesterday = daysAgo(1);
  const end = formatDate(yesterday);
  switch (presetId) {
    case 'last_7_days':
      return { startDate: formatDate(daysAgo(7)), endDate: end };
    case 'last_28_days':
      return { startDate: formatDate(daysAgo(28)), endDate: end };
    case 'last_3_months':
      return { startDate: formatDate(daysAgo(91)), endDate: end };
    case 'last_6_months':
      return { startDate: formatDate(daysAgo(182)), endDate: end };
    case 'last_12_months':
      return { startDate: formatDate(daysAgo(365)), endDate: end };
    case 'this_month': {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      // On the 1st there is no complete day yet this month: show today
      return now.getDate() === 1
        ? { startDate: formatDate(now), endDate: formatDate(now) }
        : { startDate: formatDate(first), endDate: end };
    }
    case 'last_month': {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: formatDate(first), endDate: formatDate(last) };
    }
    default:
      return null;
  }
}

/**
 * Initial range for a dashboard: the remembered choice (presets are recalculated
 * so "Last 28 days" always means up to yesterday), else Last 28 days.
 */
export function getInitialDateRange(defaultPreset = 'last_28_days') {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    saved = null;
  }
  const compare = saved?.compare !== undefined ? saved.compare : true;
  if (saved?.preset === 'custom' && saved.startDate && saved.endDate) {
    return { preset: 'custom', startDate: saved.startDate, endDate: saved.endDate, compare };
  }
  const preset = DATE_PRESETS.some((p) => p.id === saved?.preset) ? saved.preset : defaultPreset;
  return { preset, ...calculateDatesForPreset(preset), compare };
}

function persist(range) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(range));
  } catch {
    /* storage unavailable: selection just isn't remembered */
  }
}

function describeRange(startDate, endDate) {
  if (!startDate || !endDate) return '—';
  const fmt = (s) =>
    new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const days = Math.round((new Date(`${endDate}T00:00:00`) - new Date(`${startDate}T00:00:00`)) / 86400000) + 1;
  return `${fmt(startDate)} – ${fmt(endDate)} · ${days} day${days === 1 ? '' : 's'}`;
}

export default function DateRangeSelector({ value, onChange, showCompare = true, className = '' }) {
  const [selectedPreset, setSelectedPreset] = useState(value?.preset || 'last_28_days');
  const [customStart, setCustomStart] = useState(value?.startDate || '');
  const [customEnd, setCustomEnd] = useState(value?.endDate || '');
  const [customError, setCustomError] = useState('');
  const compare = value?.compare !== undefined ? value.compare : true;
  const today = formatDate(new Date());

  // Keep local UI in sync when the parent changes the range
  useEffect(() => {
    if (value?.preset) setSelectedPreset(value.preset);
    if (value?.startDate) setCustomStart(value.startDate);
    if (value?.endDate) setCustomEnd(value.endDate);
  }, [value?.preset, value?.startDate, value?.endDate]);

  // Parents that start without dates get the remembered/default range
  useEffect(() => {
    if (!value?.startDate || !value?.endDate) {
      const initial = getInitialDateRange(value?.preset);
      onChange?.(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = (range) => {
    persist(range);
    onChange?.(range);
  };

  const handlePresetChange = (presetId) => {
    setSelectedPreset(presetId);
    setCustomError('');
    if (presetId === 'custom') return; // wait for Apply
    const dates = calculateDatesForPreset(presetId);
    if (dates) emit({ preset: presetId, ...dates, compare });
  };

  const handleCustomApply = () => {
    if (!customStart || !customEnd) {
      setCustomError('Pick both a start and an end date.');
      return;
    }
    if (customStart > customEnd) {
      setCustomError('Start date must be before the end date.');
      return;
    }
    if (customEnd > today) {
      setCustomError('End date cannot be in the future.');
      return;
    }
    setCustomError('');
    emit({ preset: 'custom', startDate: customStart, endDate: customEnd, compare });
  };

  const handleCompareToggle = () => {
    emit({
      preset: value?.preset || selectedPreset,
      startDate: value?.startDate,
      endDate: value?.endDate,
      compare: !compare,
    });
  };

  return (
    <div className={`p-3 bg-surface-50 border border-surface-200 rounded-xl space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Date range">
          <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-surface-400" />
            Period
          </span>
          {DATE_PRESETS.map((p) => {
            const isActive = selectedPreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                title={p.title}
                onClick={() => handlePresetChange(p.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'bg-white text-surface-600 hover:text-surface-900 border border-surface-200'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {showCompare && (
            <button
              type="button"
              onClick={handleCompareToggle}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                compare
                  ? 'bg-brand-50 text-brand-700 border-brand-200'
                  : 'bg-white text-surface-500 border-surface-200 hover:text-surface-700'
              }`}
            >
              {compare ? (
                <CheckSquare className="w-3.5 h-3.5 text-brand-600" />
              ) : (
                <Square className="w-3.5 h-3.5 text-surface-400" />
              )}
              <span>Compare to previous period</span>
            </button>
          )}

          <div className="text-xs text-surface-600 bg-white px-2.5 py-1 rounded-lg border border-surface-200 tabular-nums">
            {describeRange(value?.startDate, value?.endDate)}
          </div>
        </div>
      </div>

      {selectedPreset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
          <label className="flex items-center gap-1.5 text-surface-600">
            From
            <input
              type="date"
              value={customStart}
              max={customEnd || today}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2 py-1 bg-white border border-surface-200 rounded-lg text-surface-800 text-xs focus:outline-hidden focus:ring-1 focus:ring-brand-500"
            />
          </label>
          <label className="flex items-center gap-1.5 text-surface-600">
            To
            <input
              type="date"
              value={customEnd}
              min={customStart || undefined}
              max={today}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2 py-1 bg-white border border-surface-200 rounded-lg text-surface-800 text-xs focus:outline-hidden focus:ring-1 focus:ring-brand-500"
            />
          </label>
          <button type="button" onClick={handleCustomApply} className="btn-primary btn-sm text-xs py-1 px-3">
            Apply
          </button>
          {customError && <span className="text-rose-600">{customError}</span>}
        </div>
      )}
    </div>
  );
}
