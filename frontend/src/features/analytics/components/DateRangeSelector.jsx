// frontend/src/features/analytics/components/DateRangeSelector.jsx
import React, { useState, useEffect } from 'react';
import { Calendar, CheckSquare, Square, ChevronDown } from 'lucide-react';

const PRESETS = [
  { id: 'last_7_days', label: 'Last 7 Days', days: 7 },
  { id: 'last_28_days', label: 'Last 28 Days', days: 28 },
  { id: 'last_30_days', label: 'Last 30 Days', days: 30 },
  { id: 'last_90_days', label: 'Last 90 Days', days: 90 },
  { id: 'yesterday', label: 'Yesterday', days: 1, offset: 1 },
  { id: 'today', label: 'Today', days: 0 },
  { id: 'custom', label: 'Custom Range' },
];

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function calculateDatesForPreset(presetId) {
  const today = new Date();
  let start = new Date();
  let end = new Date();

  switch (presetId) {
    case 'today':
      return { startDate: formatDate(today), endDate: formatDate(today) };
    case 'yesterday': {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      return { startDate: formatDate(y), endDate: formatDate(y) };
    }
    case 'last_7_days': {
      start.setDate(today.getDate() - 7);
      end.setDate(today.getDate() - 1);
      return { startDate: formatDate(start), endDate: formatDate(end) };
    }
    case 'last_28_days': {
      start.setDate(today.getDate() - 28);
      end.setDate(today.getDate() - 1);
      return { startDate: formatDate(start), endDate: formatDate(end) };
    }
    case 'last_30_days': {
      start.setDate(today.getDate() - 30);
      end.setDate(today.getDate() - 1);
      return { startDate: formatDate(start), endDate: formatDate(end) };
    }
    case 'last_90_days': {
      start.setDate(today.getDate() - 90);
      end.setDate(today.getDate() - 1);
      return { startDate: formatDate(start), endDate: formatDate(end) };
    }
    default:
      return null;
  }
}

export default function DateRangeSelector({
  value,
  onChange,
  showCompare = true,
  className = '',
}) {
  const [selectedPreset, setSelectedPreset] = useState(value?.preset || 'last_28_days');
  const [startDate, setStartDate] = useState(value?.startDate || '');
  const [endDate, setEndDate] = useState(value?.endDate || '');
  const [compare, setCompare] = useState(value?.compare !== undefined ? value.compare : true);

  // Initialize dates if not provided
  useEffect(() => {
    if (!startDate || !endDate) {
      const initial = calculateDatesForPreset('last_28_days');
      if (initial) {
        setStartDate(initial.startDate);
        setEndDate(initial.endDate);
        onChange?.({
          preset: 'last_28_days',
          startDate: initial.startDate,
          endDate: initial.endDate,
          compare,
        });
      }
    }
  }, []);

  const handlePresetChange = (presetId) => {
    setSelectedPreset(presetId);
    if (presetId !== 'custom') {
      const dates = calculateDatesForPreset(presetId);
      if (dates) {
        setStartDate(dates.startDate);
        setEndDate(dates.endDate);
        onChange?.({
          preset: presetId,
          startDate: dates.startDate,
          endDate: dates.endDate,
          compare,
        });
      }
    }
  };

  const handleCustomApply = () => {
    if (startDate && endDate) {
      onChange?.({
        preset: 'custom',
        startDate,
        endDate,
        compare,
      });
    }
  };

  const handleCompareToggle = () => {
    const nextCompare = !compare;
    setCompare(nextCompare);
    onChange?.({
      preset: selectedPreset,
      startDate,
      endDate,
      compare: nextCompare,
    });
  };

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 p-3 bg-surface-50 border border-surface-200 rounded-xl ${className}`}>
      {/* Preset Buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider mr-1 flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5 text-surface-400" />
          Period:
        </span>
        {PRESETS.map((p) => {
          const isActive = selectedPreset === p.id;
          return (
            <button
              key={p.id}
              type="button"
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

      {/* Custom Date Pickers & Compare Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        {selectedPreset === 'custom' && (
          <div className="flex items-center gap-1.5 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1 bg-white border border-surface-200 rounded-lg text-surface-800 text-xs focus:outline-hidden focus:ring-1 focus:ring-brand-500"
            />
            <span className="text-surface-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1 bg-white border border-surface-200 rounded-lg text-surface-800 text-xs focus:outline-hidden focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="button"
              onClick={handleCustomApply}
              className="btn-secondary btn-sm text-xs py-1 px-2.5"
            >
              Apply
            </button>
          </div>
        )}

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
            <span>Compare Previous Period</span>
          </button>
        )}

        <div className="text-xs text-surface-500 font-mono bg-white px-2.5 py-1 rounded-lg border border-surface-200">
          {startDate || '—'} &rarr; {endDate || '—'}
        </div>
      </div>
    </div>
  );
}
