// frontend/src/features/integrations/components/ManualSyncModal.jsx
import React, { useState } from 'react';
import Modal from '../../../components/common/Modal.jsx';
import { useTriggerManualSyncMutation } from '../integrationsApi.js';
import { RefreshCw, CheckCircle2, AlertCircle, Database, Calendar } from 'lucide-react';

function getDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

export default function ManualSyncModal({
  isOpen,
  onClose,
  workspaceId,
  websiteId,
  integrationType, // 'GA4' | 'GSC'
}) {
  const [startDate, setStartDate] = useState(getDaysAgo(30));
  const [endDate, setEndDate] = useState(getDaysAgo(1));
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState(null);

  const [triggerSync, { isLoading }] = useTriggerManualSyncMutation();

  const handlePreset = (days) => {
    setStartDate(getDaysAgo(days));
    setEndDate(getDaysAgo(1));
  };

  const handleSync = async (e) => {
    e.preventDefault();
    setSyncResult(null);
    setSyncError(null);

    try {
      const res = await triggerSync({
        workspaceId,
        websiteId,
        integrationType,
        startDate,
        endDate,
      }).unwrap();

      setSyncResult(res.data);
    } catch (err) {
      setSyncError(err?.data?.message || err.message || 'Import failed');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Import ${integrationType === 'GA4' ? 'Google Analytics 4' : 'Google Search Console'} Data`}
    >
      <form onSubmit={handleSync} className="space-y-4">
        <p className="text-xs text-surface-500">
          Retrieve performance records directly from Google's official API and store them in your local MySQL database.
        </p>

        {/* Date Presets */}
        <div>
          <label className="label">Quick Date Presets</label>
          <div className="flex items-center gap-2">
            {[
              { label: 'Last 7 Days', days: 7 },
              { label: 'Last 30 Days', days: 30 },
              { label: 'Last 90 Days', days: 90 },
            ].map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => handlePreset(p.days)}
                className="btn-secondary btn-sm"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Custom date range</label>
          </div>
          <div>
            <label className="label">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input text-sm"
              required
            />
          </div>
          <div>
            <label className="label">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input text-sm"
              required
            />
          </div>
        </div>

        {/* Result Feedback */}
        {syncResult && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-1">
            <div className="flex items-center gap-2 font-semibold text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Data Import Completed Successfully</span>
            </div>
            <div className="flex items-center gap-4 text-emerald-700 pt-1">
              <span>Fetched: <strong>{syncResult.rowsFetched}</strong></span>
              <span>Inserted/Updated: <strong>{syncResult.rowsInserted}</strong></span>
              <span>Time: <strong>{(syncResult.durationMs / 1000).toFixed(1)}s</strong></span>
            </div>
          </div>
        )}

        {syncError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Import Error</p>
              <p>{syncError}</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-3 border-t border-surface-100">
          <button type="button" onClick={onClose} className="btn-secondary">
            {syncResult ? 'Close' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary inline-flex items-center gap-2"
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            <span>{isLoading ? 'Importing from Google…' : 'Start Data Import'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
