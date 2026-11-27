// frontend/src/features/sync/components/SyncScheduleModal.jsx
import React, { useState, useEffect } from 'react';
import Modal from '../../../components/common/Modal.jsx';
import { useUpdateWebsiteSyncScheduleMutation } from '../../integrations/integrationsApi.js';
import { Clock, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SyncScheduleModal({
  isOpen,
  onClose,
  workspaceId,
  websiteId,
  provider,
  schedule,
}) {
  const [enabled, setEnabled] = useState(true);
  const [intervalMinutes, setIntervalMinutes] = useState(720);
  const [errorMsg, setErrorMsg] = useState(null);

  const [updateSchedule, { isLoading }] = useUpdateWebsiteSyncScheduleMutation();

  useEffect(() => {
    if (schedule) {
      setEnabled(schedule.enabled !== undefined ? schedule.enabled : true);
      setIntervalMinutes(schedule.intervalMinutes || 720);
    }
  }, [schedule]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      await updateSchedule({
        workspaceId,
        websiteId,
        provider,
        enabled,
        intervalMinutes: Number(intervalMinutes),
      }).unwrap();

      onClose();
    } catch (err) {
      setErrorMsg(err?.data?.message || err.message || 'Failed to update schedule');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Automated Sync Schedule — ${provider}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Enabled Toggle */}
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-surface-200 bg-surface-50/50">
          <div>
            <span className="text-sm font-semibold text-surface-900 block">
              Automated Recurring Sync
            </span>
            <span className="text-xs text-surface-500">
              When active, background workers automatically pull fresh data into MySQL.
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-surface-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
          </label>
        </div>

        {/* Interval Selector */}
        {enabled && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-surface-700">
              Sync Frequency
            </label>
            <select
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              className="input-field text-sm"
            >
              <option value={720}>Every 12 hours (Twice daily) - Recommended</option>
              <option value={1440}>Every 24 hours (Once daily)</option>
              <option value={360}>Every 6 hours (4 times daily)</option>
            </select>
            <span className="text-2xs text-surface-400">
              {provider === 'CLARITY'
                ? 'Microsoft Clarity allows 10 calls a day per project; twice daily uses 2. Avoid every 6 hours if you also import manually.'
                : 'Pulls finalized data from Google APIs and updates local MySQL checkpoints.'}
            </span>
          </div>
        )}

        <div className="pt-3 border-t border-surface-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary btn-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary btn-sm"
          >
            {isLoading ? 'Saving…' : 'Save Schedule'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
