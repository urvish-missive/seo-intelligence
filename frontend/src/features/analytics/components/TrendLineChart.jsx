// frontend/src/features/analytics/components/TrendLineChart.jsx
import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface-900 text-white text-xs rounded-lg p-2.5 shadow-lg border border-surface-800 space-y-1">
        <div className="font-semibold text-surface-300 border-b border-surface-700 pb-1 mb-1 font-mono">
          {label}
        </div>
        {payload.map((entry, index) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-surface-300">{entry.name}:</span>
            </div>
            <span className="font-bold font-mono text-white">
              {typeof entry.value === 'number'
                ? entry.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export default function TrendLineChart({
  data = [],
  series = [],
  height = 280,
  xAxisKey = 'date',
  yAxisFormatter,
  emptyMessage = 'No historical time-series data available for this range.',
  className = '',
}) {
  if (!data || data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center border border-dashed border-surface-200 rounded-xl bg-surface-50/50 text-surface-400 text-xs p-8 ${className}`}
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  // Format date labels (e.g., "2026-11-15" -> "Nov 15")
  const formattedData = data.map((item) => {
    let dateLabel = item[xAxisKey];
    if (typeof dateLabel === 'string' && dateLabel.includes('-')) {
      const parts = dateLabel.split('-');
      if (parts.length === 3) {
        const monthNames = [
          'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
        ];
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        dateLabel = `${monthNames[m]} ${d}`;
      }
    }
    return { ...item, _displayDate: dateLabel };
  });

  return (
    <div className={`w-full ${className}`} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formattedData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="_displayDate"
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <YAxis
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
            tickFormatter={yAxisFormatter || ((v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v))}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="top"
            height={36}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: '11px', color: '#64748b' }}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.stroke || '#2563eb'}
              strokeWidth={s.strokeWidth || 2}
              strokeDasharray={s.strokeDasharray}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
