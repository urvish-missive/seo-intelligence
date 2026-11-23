// frontend/src/components/common/Modal.jsx
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-surface-950/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div
          className={`relative w-full ${maxWidth} max-h-[90vh] flex flex-col rounded-xl bg-white shadow-dropdown border border-surface-200 transition-all z-10 my-auto`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-surface-100 px-4 sm:px-6 py-3.5 sm:py-4 flex-shrink-0">
            <h3 className="text-sm sm:text-base font-semibold text-surface-900">{title}</h3>
            <button
              onClick={onClose}
              className="text-surface-400 hover:text-surface-600 transition-colors p-1 rounded-md hover:bg-surface-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
