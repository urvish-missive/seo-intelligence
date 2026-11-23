// frontend/src/features/analytics/components/BarBreakdownChart.jsx
import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

function CustomBarTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-surface-900 text-white text-xs rounded-lg p-2 shadow-lg border border-surface-800">
        <div className="font-semibold text-surface-200">{data.name || data.key}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-surface-400">Value:</span>
          <span className="font-bold font-mono">
            {typeof payload[0].value === 'number' ? payload[0].value.toLocaleString() : payload[0].value}
          </span>
        </div>
        {data.percentage !== undefined && (
          <div className="flex items-center gap-2 text-2xs text-surface-400">
            <span>Share:</span>
            <span>{Number(data.percentage).toFixed(1)}%</span>
          </div>
        )}
      </div>
    );
  }
  return null;
}

export default function BarBreakdownChart({
  data = [],
  dataKey = 'value',
  nameKey = 'name',
  height = 240,
  colors = DEFAULT_COLORS,
  emptyMessage = 'No breakdown data available.',
  className = '',
}) {
  if (!data || data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center border border-dashed border-surface-200 rounded-xl bg-surface-50/50 text-surface-400 text-xs p-6 ${className}`}
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} />
          <YAxis
            type="category"
            dataKey={nameKey}
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
            width={70}
          />
          <Tooltip content={<CustomBarTooltip />} />
          <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} barSize={16}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
