// frontend/src/features/analytics/components/MetricKpiCard.jsx
import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, HelpCircle } from 'lucide-react';

export default function MetricKpiCard({
  title,
  value,
  previousValue,
  changePercentage,
  format = 'number', // 'number' | 'percent' | 'duration' | 'decimal' | 'rank'
  isInverse = false, // true for bounce rate or average position where a lower value is better
  icon: Icon,
  iconColor = 'brand',
  subtitle,
  tooltip,
  compareEnabled = true,
  className = '',
}) {
  const formatVal = (v) => {
    if (v === null || v === undefined || isNaN(v)) return '—';
    if (format === 'percent') return `${Number(v).toFixed(2)}%`;
    if (format === 'decimal') return Number(v).toFixed(2);
    if (format === 'rank') return Number(v).toFixed(1);
    if (format === 'duration') {
      const sec = Math.round(v);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return m > 0 ? `${m}m ${s}s` : `${s}s`;
    }
    return Number(v).toLocaleString();
  };

  const getIconBg = () => {
    switch (iconColor) {
      case 'emerald':
        return 'bg-emerald-50 text-emerald-600 border-emerald-200';
      case 'purple':
        return 'bg-purple-50 text-purple-600 border-purple-200';
      case 'blue':
        return 'bg-blue-50 text-blue-600 border-blue-200';
      case 'amber':
        return 'bg-amber-50 text-amber-600 border-amber-200';
      case 'rose':
        return 'bg-rose-50 text-rose-600 border-rose-200';
      default:
        return 'bg-brand-50 text-brand-600 border-brand-200';
    }
  };

  // Determine delta badge styling
  let trendDirection = 'neutral';
  let isGood = false;

  if (changePercentage !== null && changePercentage !== undefined) {
    if (changePercentage > 0) {
      trendDirection = 'up';
      isGood = !isInverse;
    } else if (changePercentage < 0) {
      trendDirection = 'down';
      isGood = isInverse;
    }
  }

  const getTrendBadge = () => {
    if (!compareEnabled || changePercentage === null || changePercentage === undefined) {
      return null;
    }

    if (trendDirection === 'neutral') {
      return (
        <span className="inline-flex items-center gap-0.5 text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-surface-100 text-surface-600">
          <Minus className="w-3 h-3" />
          <span>0.0%</span>
        </span>
      );
    }

    const badgeBg = isGood
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : 'bg-rose-50 text-rose-700 border border-rose-200';

    const IconComp = trendDirection === 'up' ? ArrowUpRight : ArrowDownRight;
    const sign = changePercentage > 0 ? '+' : '';

    return (
      <span className={`inline-flex items-center gap-0.5 text-2xs font-semibold px-1.5 py-0.5 rounded-full ${badgeBg}`}>
        <IconComp className="w-3 h-3" />
        <span>
          {sign}
          {changePercentage.toFixed(1)}%
        </span>
      </span>
    );
  };

  return (
    <div className={`card p-4 transition-all duration-150 hover:border-surface-300 relative ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
            {title}
          </span>
          {tooltip && (
            <span title={tooltip} className="cursor-help text-surface-400 hover:text-surface-600">
              <HelpCircle className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
        {Icon && (
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${getIconBg()}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold text-surface-900 tracking-tight">
          {formatVal(value)}
        </div>
        {getTrendBadge()}
      </div>

      {compareEnabled && previousValue !== undefined && previousValue !== null && (
        <div className="mt-1 flex items-center justify-between text-2xs text-surface-400">
          <span>Prev: {formatVal(previousValue)}</span>
          {subtitle && <span>{subtitle}</span>}
        </div>
      )}

      {!compareEnabled && subtitle && (
        <div className="mt-1 text-2xs text-surface-400">{subtitle}</div>
      )}
    </div>
  );
}
