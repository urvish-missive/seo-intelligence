// frontend/src/features/integrations/components/ClaritySyncModal.jsx
import React, { useState } from 'react';
import Modal from '../../../components/common/Modal.jsx';
import { useTriggerClarityImportMutation } from '../integrationsApi.js';
import { RefreshCw, CheckCircle2, AlertCircle, Database, Clock, Layers } from 'lucide-react';

export default function ClaritySyncModal({
  isOpen,
  onClose,
  workspaceId,
  websiteId,
  clarityConnection,
}) {
  const [numOfDays, setNumOfDays] = useState(1);
  const [preset, setPreset] = useState('OVERVIEW');
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);

  const [triggerImport, { isLoading }] = useTriggerClarityImportMutation();

  const handleImport = async (e) => {
    e.preventDefault();
    setImportResult(null);
    setImportError(null);

    try {
      const res = await triggerImport({
        workspaceId,
        websiteId,
        numOfDays: Number(numOfDays),
        preset,
      }).unwrap();

      setImportResult(res.data);
    } catch (err) {
      setImportError(err?.data?.message || err.message || 'Clarity import failed');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Microsoft Clarity Data"
    >
      <form onSubmit={handleImport} className="space-y-4">
        {/* Quota & Window Notice */}
        <div className="p-3.5 rounded-xl bg-surface-50 border border-surface-200 text-xs text-surface-600 space-y-1.5">
          <div className="flex items-center justify-between font-semibold text-surface-800">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-brand-600" />
              Recent Rolling Window API
            </span>
            <span className="font-mono text-2xs bg-surface-200 px-2 py-0.5 rounded text-surface-700">
              10 requests/day quota
            </span>
          </div>
          <p>
            Microsoft Clarity only exports a rolling window of the last 1, 2, or 3 days. Its API does not accept custom start and end dates. Each import is saved as a snapshot you can review later.
          </p>
          <a
            href="https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-brand-700 underline"
          >
            Microsoft Clarity API date limits
          </a>
        </div>

        {/* Rolling Window Selector */}
        <div>
          <label className="label">1. Select Reporting Window</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { val: 1, label: 'Last 24 Hours (1 Day)' },
              { val: 2, label: 'Last 48 Hours (2 Days)' },
              { val: 3, label: 'Last 72 Hours (3 Days)' },
            ].map((w) => (
              <button
                key={w.val}
                type="button"
                onClick={() => setNumOfDays(w.val)}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border text-center transition-all ${
                  numOfDays === w.val
                    ? 'border-brand-600 bg-brand-50 text-brand-700 shadow-sm'
                    : 'border-surface-200 bg-white text-surface-600 hover:border-surface-300'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* Preset Selector */}
        <div>
          <label className="label">2. Select Report Preset</label>
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            className="input text-sm"
          >
            <option value="OVERVIEW">Overall Traffic & Friction (Dead Clicks, Rage Clicks, Scroll Depth)</option>
            <option value="DEVICE">Device Category Breakdown (Mobile, Desktop, Tablet)</option>
            <option value="BROWSER">Browser Breakdown (Chrome, Safari, Edge, Firefox)</option>
            <option value="COUNTRY">Country & Regional Breakdown</option>
            <option value="URL">Page URL & Friction Breakdown</option>
            <option value="ACQUISITION">Traffic Source & Medium Breakdown</option>
          </select>
        </div>

        {/* Result Feedback */}
        {importResult && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-1">
            <div className="flex items-center gap-2 font-semibold text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Clarity Snapshot Imported & Stored</span>
            </div>
            <div className="flex items-center gap-4 text-emerald-700 pt-1">
              <span>Rows: <strong>{importResult.rowCount}</strong></span>
              <span>Calls Remaining Today: <strong>{importResult.quotaRemaining}</strong></span>
              <span>Time: <strong>{(importResult.durationMs / 1000).toFixed(1)}s</strong></span>
            </div>
          </div>
        )}

        {importError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Import Error</p>
              <p>{importError}</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-3 border-t border-surface-100">
          <button type="button" onClick={onClose} className="btn-secondary">
            {importResult ? 'Close' : 'Cancel'}
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
            <span>{isLoading ? 'Exporting from Microsoft…' : 'Execute Clarity Import'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
