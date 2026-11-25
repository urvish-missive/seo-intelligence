// frontend/src/features/sync/components/SyncManagementView.jsx
import React, { useState } from 'react';
import {
  useGetWebsiteBackgroundSyncStatusQuery,
  useGetWebsiteBackgroundSyncHistoryQuery,
  useTriggerBackgroundSyncMutation,
  useRetryBackgroundSyncJobMutation,
  useCancelBackgroundSyncJobMutation,
  useGetSyncHealthQuery,
} from '../../integrations/integrationsApi.js';
import SyncScheduleModal from './SyncScheduleModal.jsx';
import {
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  RotateCcw,
  Ban,
  Calendar,
  Layers,
  Database,
  Server,
  Zap,
} from 'lucide-react';

export default function SyncManagementView({ workspaceId, websiteId }) {
  const [selectedScheduleProvider, setSelectedScheduleProvider] = useState(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  const {
    data: statusData,
    isLoading: isLoadingStatus,
    refetch: refetchStatus,
  } = useGetWebsiteBackgroundSyncStatusQuery(
    { workspaceId, websiteId },
    { skip: !workspaceId || !websiteId, pollingInterval: 10000 }
  );

  const {
    data: historyData,
    isLoading: isLoadingHistory,
    refetch: refetchHistory,
  } = useGetWebsiteBackgroundSyncHistoryQuery(
    { workspaceId, websiteId, limit: 15 },
    { skip: !workspaceId || !websiteId, pollingInterval: 10000 }
  );

  const { data: healthData } = useGetSyncHealthQuery(undefined, {
    pollingInterval: 30000,
  });

  const [triggerSync, { isLoading: isTriggering }] = useTriggerBackgroundSyncMutation();
  const [retryJob, { isLoading: isRetrying }] = useRetryBackgroundSyncJobMutation();
  const [cancelJob, { isLoading: isCancelling }] = useCancelBackgroundSyncJobMutation();

  const syncStatus = statusData?.data;
  const providers = syncStatus?.providers || [];
  const jobs = historyData?.data?.jobs || [];
  const health = healthData?.data;

  const handleTriggerSync = async (provider) => {
    setFeedbackMsg(null);
    try {
      const res = await triggerSync({
        workspaceId,
        websiteId,
        provider,
      }).unwrap();

      setFeedbackMsg({
        type: 'success',
        text: res.message || `${provider} sync job queued successfully.`,
      });
      refetchStatus();
      refetchHistory();
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: err?.data?.message || err.message || 'Failed to trigger sync',
      });
    }
  };

  const handleRetryJob = async (jobId) => {
    try {
      await retryJob({ workspaceId, jobId }).unwrap();
      refetchHistory();
      refetchStatus();
    } catch (err) {
      alert(`Retry failed: ${err?.data?.message || err.message}`);
    }
  };

  const handleCancelJob = async (jobId) => {
    if (confirm('Cancel this in-flight or queued job?')) {
      try {
        await cancelJob({ workspaceId, jobId }).unwrap();
        refetchHistory();
        refetchStatus();
      } catch (err) {
        alert(`Cancel failed: ${err?.data?.message || err.message}`);
      }
    }
  };

  const handleOpenSchedule = (providerObj) => {
    setSelectedScheduleProvider(providerObj);
    setScheduleModalOpen(true);
  };

  if (isLoadingStatus) {
    return (
      <div className="card p-12 text-center text-sm text-surface-400">
        Loading background synchronisation status…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner: Queue & Redis Health */}
      <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-50/60 border border-surface-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center border border-brand-200">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-surface-900">Background Sync Engine</span>
              <span
                className={`text-2xs px-2 py-0.5 rounded-full font-semibold ${
                  health?.connected
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {health?.connected ? 'Redis + BullMQ Active' : 'Direct Async Mode'}
              </span>
            </div>
            <p className="text-xs text-surface-500 mt-0.5">
              Automated daily workers poll Google Analytics 4, Search Console, and Microsoft Clarity into local MySQL.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={() => {
              refetchStatus();
              refetchHistory();
            }}
            className="btn-secondary btn-sm inline-flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Status</span>
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            feedbackMsg.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-2xs font-bold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Provider Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {providers.map((p) => {
          const isClarity = p.provider === 'CLARITY';
          const quota = p.clarityQuota;

          return (
            <div
              key={p.provider}
              className="card p-5 space-y-4 border border-surface-200 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-surface-900">{p.provider}</span>
                    <span
                      className={`text-2xs px-2 py-0.5 rounded-full font-semibold ${
                        p.isConnected
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-surface-200 text-surface-600'
                      }`}
                    >
                      {p.isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                    </span>
                  </div>
                  <button
                    onClick={() => handleOpenSchedule(p)}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Schedule</span>
                  </button>
                </div>

                <div className="space-y-1.5 text-xs text-surface-600">
                  <div className="flex items-center justify-between">
                    <span className="text-surface-400">Resource:</span>
                    <span className="font-medium text-surface-800 truncate max-w-[170px]">
                      {p.selectedPropertyName || p.selectedProperty || 'None'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-surface-400">Last Synced:</span>
                    <span className="font-medium text-surface-800">
                      {p.lastSuccessfulSyncAt
                        ? new Date(p.lastSuccessfulSyncAt).toLocaleString()
                        : 'Never'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-surface-400">Data Checkpoint:</span>
                    <span className="font-mono text-surface-800">
                      {p.lastSuccessfulDate || 'No records'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-surface-400">Schedule:</span>
                    <span className="font-medium text-surface-800">
                      {p.schedule?.enabled
                        ? `Every ${p.schedule.intervalMinutes / 60}h`
                        : 'Paused'}
                    </span>
                  </div>
                </div>

                {/* Clarity Quota Meter */}
                {isClarity && quota && (
                  <div className="pt-2 border-t border-surface-100">
                    <div className="flex items-center justify-between text-2xs mb-1">
                      <span className="text-surface-500">Daily API Quota:</span>
                      <span className="font-bold text-surface-800">
                        {quota.callsToday} / {quota.limit} used
                      </span>
                    </div>
                    <div className="w-full bg-surface-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${
                          quota.callsToday >= 10
                            ? 'bg-rose-500'
                            : quota.callsToday >= 7
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, (quota.callsToday / 10) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-surface-100 flex items-center justify-end">
                <button
                  onClick={() => handleTriggerSync(p.provider)}
                  disabled={!p.isConnected || isTriggering || (isClarity && quota?.callsToday >= 10)}
                  className="btn-primary btn-sm w-full inline-flex items-center justify-center gap-1.5 text-xs disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Sync Now</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sync Jobs & History Table */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-surface-900">Background Sync Execution History</h3>
            <p className="text-xs text-surface-500">
              Audit log of background queue tasks, records fetched, and execution status.
            </p>
          </div>
          <button
            onClick={() => refetchHistory()}
            className="text-xs text-surface-500 hover:text-surface-800 flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="p-8 text-center text-xs text-surface-400">
            No synchronisation jobs recorded yet for this website. Click "Sync Now" above to run an initial data pull.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-surface-200 text-surface-400 font-semibold">
                  <th className="py-2.5 px-3">Provider</th>
                  <th className="py-2.5 px-3">Job Type</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Records Stored</th>
                  <th className="py-2.5 px-3">Date Range</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 text-surface-700">
                {jobs.map((job) => {
                  let badgeClass = 'badge-gray';
                  if (job.status === 'COMPLETED') badgeClass = 'badge-success';
                  if (job.status === 'FAILED') badgeClass = 'badge-danger';
                  if (['PENDING', 'PROCESSING', 'RUNNING', 'QUEUED'].includes(job.status)) badgeClass = 'badge-info';

                  return (
                    <tr key={job.id} className="hover:bg-surface-50/50">
                      <td className="py-2.5 px-3 font-semibold text-surface-900">
                        {job.provider || 'UNKNOWN'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono text-2xs bg-surface-100 text-surface-700 px-1.5 py-0.5 rounded">
                          {job.jobType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`${badgeClass} text-2xs uppercase tracking-wider`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-medium">
                        {job.recordsStored || 0}
                      </td>
                      <td className="py-2.5 px-3 text-surface-500 font-mono text-2xs">
                        {job.dateRangeStart && job.dateRangeEnd
                          ? `${job.dateRangeStart} → ${job.dateRangeEnd}`
                          : 'Default Window'}
                      </td>
                      <td className="py-2.5 px-3 text-surface-500">
                        {new Date(job.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {job.status === 'FAILED' && (
                          <button
                            onClick={() => handleRetryJob(job.id)}
                            disabled={isRetrying}
                            className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        )}
                        {['PENDING', 'PROCESSING', 'RUNNING', 'QUEUED'].includes(job.status) && (
                          <button
                            onClick={() => handleCancelJob(job.id)}
                            disabled={isCancelling}
                            className="text-xs text-rose-600 hover:underline inline-flex items-center gap-1"
                          >
                            <Ban className="w-3 h-3" />
                            <span>Cancel</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Schedule Configuration Modal */}
      {selectedScheduleProvider && (
        <SyncScheduleModal
          isOpen={scheduleModalOpen}
          onClose={() => {
            setScheduleModalOpen(false);
            setSelectedScheduleProvider(null);
            refetchStatus();
          }}
          workspaceId={workspaceId}
          websiteId={websiteId}
          provider={selectedScheduleProvider.provider}
          schedule={selectedScheduleProvider.schedule}
        />
      )}
    </div>
  );
}
