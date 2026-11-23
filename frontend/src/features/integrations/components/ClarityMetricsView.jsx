// frontend/src/features/integrations/components/ClarityMetricsView.jsx
import React, { useState } from 'react';
import {
  useGetClarityOverviewQuery,
  useGetClaritySnapshotsQuery,
  useGetClaritySnapshotByIdQuery,
} from '../integrationsApi.js';
import Modal from '../../../components/common/Modal.jsx';
import {
  Zap,
  MousePointer,
  AlertTriangle,
  Flame,
  ArrowLeftRight,
  TrendingDown,
  Layers,
  FileCode,
  Smartphone,
  Eye,
  Database,
  Calendar,
} from 'lucide-react';

export default function ClarityMetricsView({ workspaceId, websiteId }) {
  const [activeTab, setActiveTab] = useState('friction'); // 'friction' | 'pages' | 'devices' | 'snapshots'
  const [selectedSnapshotId, setSelectedSnapshotId] = useState(null);

  const { data: overviewData, isLoading: isLoadingOverview } = useGetClarityOverviewQuery(
    { workspaceId, websiteId },
    { skip: !workspaceId || !websiteId }
  );

  const { data: snapshotsData, isLoading: isLoadingSnapshots } = useGetClaritySnapshotsQuery(
    { workspaceId, websiteId, limit: 20 },
    { skip: !workspaceId || !websiteId }
  );

  const { data: snapshotDetailData, isFetching: isFetchingDetail } = useGetClaritySnapshotByIdQuery(
    { workspaceId, websiteId, snapshotId: selectedSnapshotId },
    { skip: !workspaceId || !websiteId || !selectedSnapshotId }
  );

  const overview = overviewData?.data;
  const summary = overview?.summary;
  const snapshots = snapshotsData?.data?.snapshots || [];
  const topPages = overview?.topPages || [];
  const deviceBreakdown = overview?.deviceBreakdown || [];

  if (isLoadingOverview) {
    return (
      <div className="card p-12 text-center text-sm text-surface-400">
        Loading stored Microsoft Clarity behavioral metrics…
      </div>
    );
  }

  const hasData = (summary?.totalSessions || 0) > 0 || snapshots.length > 0;

  if (!hasData) {
    return (
      <div className="card p-8 text-center">
        <Zap className="w-10 h-10 text-surface-300 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-surface-900">No Clarity Data Stored Yet</h3>
        <p className="text-sm text-surface-500 max-w-md mx-auto mt-1 mb-4">
          Connect your Microsoft Clarity project above and click <strong>"Import Data"</strong> to capture behavioral friction snapshots locally.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards: Behavioral Friction */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Rage Clicks */}
        <div className="card p-4">
          <div className="flex items-center justify-between text-surface-500 mb-1">
            <span className="text-xs font-medium">Rage Clicks</span>
            <Flame className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-rose-600">
            {(summary?.totalRageClicks || 0).toLocaleString()}
          </div>
          <p className="text-2xs text-surface-400 mt-1">Users clicking rapidly in frustration</p>
        </div>

        {/* Dead Clicks */}
        <div className="card p-4">
          <div className="flex items-center justify-between text-surface-500 mb-1">
            <span className="text-xs font-medium">Dead Clicks</span>
            <MousePointer className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-600">
            {(summary?.totalDeadClicks || 0).toLocaleString()}
          </div>
          <p className="text-2xs text-surface-400 mt-1">Clicks producing zero interaction</p>
        </div>

        {/* Quickbacks */}
        <div className="card p-4">
          <div className="flex items-center justify-between text-surface-500 mb-1">
            <span className="text-xs font-medium">Quickback Clicks</span>
            <ArrowLeftRight className="w-4 h-4 text-brand-600" />
          </div>
          <div className="text-2xl font-bold text-surface-900">
            {(summary?.totalQuickbacks || 0).toLocaleString()}
          </div>
          <p className="text-2xs text-surface-400 mt-1">Immediate return after clicking away</p>
        </div>

        {/* Excessive Scrolling */}
        <div className="card p-4">
          <div className="flex items-center justify-between text-surface-500 mb-1">
            <span className="text-xs font-medium">Excessive Scrolls</span>
            <TrendingDown className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-surface-900">
            {(summary?.totalExcessiveScrolls || 0).toLocaleString()}
          </div>
          <p className="text-2xs text-surface-400 mt-1">Frantic scrolling searching for content</p>
        </div>
      </div>

      {/* Secondary Row: Engagement & Technical Signals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-surface-500 block">Avg Scroll Depth</span>
            <span className="text-xl font-bold text-surface-900">{summary?.avgScrollDepth || 0}%</span>
          </div>
          <Layers className="w-6 h-6 text-brand-500" />
        </div>

        <div className="card p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-surface-500 block">Avg Active Time</span>
            <span className="text-xl font-bold text-surface-900">{summary?.avgTimeOnPageSec || 0}s</span>
          </div>
          <Eye className="w-6 h-6 text-emerald-500" />
        </div>

        <div className="card p-4 flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-surface-500 block">Script / JS Errors</span>
            <span className="text-xl font-bold text-rose-600">{summary?.totalScriptErrors || 0}</span>
          </div>
          <AlertTriangle className="w-6 h-6 text-rose-500" />
        </div>
      </div>

      {/* Tabbed Views */}
      <div className="card">
        {/* Tabs */}
        <div className="border-b border-surface-200 flex items-center px-6 pt-4 gap-6">
          <button
            onClick={() => setActiveTab('friction')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'friction'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Behavioral Friction</span>
          </button>

          <button
            onClick={() => setActiveTab('pages')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'pages'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Page URLs ({topPages.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('devices')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'devices'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Devices ({deviceBreakdown.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('snapshots')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'snapshots'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Captured Snapshots ({snapshots.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'friction' && (
            <div className="space-y-4 text-sm">
              <div className="p-4 rounded-xl bg-surface-50 border border-surface-200">
                <h4 className="font-semibold text-surface-900 mb-1">SEO Impact of Behavioral Friction</h4>
                <p className="text-xs text-surface-600 leading-relaxed">
                  High dead click counts and rage clicks on specific URLs indicate confusing UI elements, broken links, or misleading anchor text. Quickback clicks directly correlate with poor search intent match (pogo-sticking), signalling search engines that the page did not fulfill the query.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'pages' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-100 text-xs text-surface-400 font-semibold uppercase tracking-wider">
                    <th className="pb-3">URL Path</th>
                    <th className="pb-3 text-right">Sessions</th>
                    <th className="pb-3 text-right">Dead Clicks</th>
                    <th className="pb-3 text-right">Rage Clicks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 text-surface-700">
                  {topPages.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-surface-400">
                        No URL breakdown data captured yet. Run an import using the <strong>URL Breakdown</strong> preset.
                      </td>
                    </tr>
                  ) : (
                    topPages.map((p, idx) => (
                      <tr key={idx} className="hover:bg-surface-50/50">
                        <td className="py-2.5 font-medium text-surface-900 max-w-md truncate">
                          {p.page}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-brand-600">
                          {p.sessions.toLocaleString()}
                        </td>
                        <td className="py-2.5 text-right text-amber-600">{p.deadClicks}</td>
                        <td className="py-2.5 text-right text-rose-600">{p.rageClicks}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'devices' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-100 text-xs text-surface-400 font-semibold uppercase tracking-wider">
                    <th className="pb-3">Device Category</th>
                    <th className="pb-3 text-right">Sessions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 text-surface-700">
                  {deviceBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-6 text-center text-xs text-surface-400">
                        No device breakdown data captured yet.
                      </td>
                    </tr>
                  ) : (
                    deviceBreakdown.map((d, idx) => (
                      <tr key={idx} className="hover:bg-surface-50/50">
                        <td className="py-2.5 font-medium capitalize text-surface-900">{d.device}</td>
                        <td className="py-2.5 text-right font-semibold text-brand-600">
                          {d.sessions.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'snapshots' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-100 text-xs text-surface-400 font-semibold uppercase tracking-wider">
                    <th className="pb-3">Captured At (UTC)</th>
                    <th className="pb-3">Preset</th>
                    <th className="pb-3">Window</th>
                    <th className="pb-3 text-right">Rows</th>
                    <th className="pb-3 text-right">Status</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 text-surface-700">
                  {snapshots.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-xs text-surface-400">
                        No Clarity snapshots captured yet.
                      </td>
                    </tr>
                  ) : (
                    snapshots.map((s) => (
                      <tr key={s.id} className="hover:bg-surface-50/50">
                        <td className="py-2.5 text-xs text-surface-600">
                          {new Date(s.importTimestamp).toLocaleString()}
                        </td>
                        <td className="py-2.5 text-xs font-semibold text-surface-900">{s.preset}</td>
                        <td className="py-2.5 text-xs text-surface-500 font-mono">
                          Last {s.requestedNumOfDays * 24}h ({s.requestedNumOfDays}d)
                        </td>
                        <td className="py-2.5 text-right text-xs font-mono">{s.rowCount}</td>
                        <td className="py-2.5 text-right">
                          <span className="text-2xs px-2 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-800">
                            {s.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => setSelectedSnapshotId(s.id)}
                            className="text-xs text-brand-600 hover:underline font-semibold"
                          >
                            Inspect JSON
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Raw JSON Inspect Modal Drawer */}
      <Modal
        isOpen={!!selectedSnapshotId}
        onClose={() => setSelectedSnapshotId(null)}
        title="Inspect Raw Microsoft Clarity Response"
      >
        <div className="space-y-3">
          <p className="text-xs text-surface-500">
            Unedited, cryptographically intact API payload as returned by Microsoft Clarity.
          </p>
          {isFetchingDetail ? (
            <div className="py-8 text-center text-xs text-surface-400">Loading payload…</div>
          ) : (
            <pre className="bg-surface-900 text-emerald-400 p-4 rounded-xl text-xs font-mono max-h-96 overflow-y-auto overflow-x-auto">
              {JSON.stringify(snapshotDetailData?.data?.rawResponse, null, 2)}
            </pre>
          )}
          <div className="flex justify-end pt-2">
            <button
              onClick={() => setSelectedSnapshotId(null)}
              className="btn-secondary btn-sm"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
