// frontend/src/components/common/EmptyState.jsx
import React from 'react';

export default function EmptyState({ icon: Icon, title, description, actionText, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-xl border border-dashed border-surface-300 bg-surface-50/50">
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-surface-100 text-surface-500 flex items-center justify-center mb-4">
          <Icon className="w-6 h-6" />
        </div>
      )}
      <h3 className="text-base font-semibold text-surface-900">{title}</h3>
      <p className="text-sm text-surface-500 mt-1 max-w-sm mb-5">{description}</p>
      {actionText && onAction && (
        <button onClick={onAction} className="btn-primary">
          {actionText}
        </button>
      )}
    </div>
  );
}
