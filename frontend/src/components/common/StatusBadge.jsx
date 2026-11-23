// frontend/src/components/common/StatusBadge.jsx
import React from 'react';

const STATUS_CONFIG = {
  ACTIVE: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  INACTIVE: { label: 'Inactive', cls: 'bg-surface-100 text-surface-600 border-surface-200' },
  ARCHIVED: { label: 'Archived', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  SUSPENDED: { label: 'Suspended', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  PENDING: { label: 'Pending', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  CONNECTED: { label: 'Connected', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  NOT_CONNECTED: { label: 'Not Connected', cls: 'bg-surface-100 text-surface-500 border-surface-200' },
  SYNCING: { label: 'Syncing', cls: 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse' },
  FAILED: { label: 'Failed', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  EXPIRED: { label: 'Expired', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || {
    label: status || 'Unknown',
    cls: 'bg-surface-100 text-surface-600 border-surface-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-70" />
      {cfg.label}
    </span>
  );
}
