// frontend/src/features/analytics/components/ClarityDashboardView.jsx
import React from 'react';
import {
  MousePointer,
  AlertTriangle,
  Flame,
  ArrowLeftRight,
  TrendingDown,
  Layers,
  FileCode,
  Smartphone,
  Info,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import MetricKpiCard from './MetricKpiCard.jsx';
import BarBreakdownChart from './BarBreakdownChart.jsx';
import DataTableWithFilter from './DataTableWithFilter.jsx';
import { useGetClaritySummaryQuery } from '../analyticsApi.js';

export default function ClarityDashboardView({
  workspaceId,
  websiteId,
}) {
  const { data: clarityData, isLoading } = useGetClaritySummaryQuery(
    { workspaceId, websiteId },
    { skip: !workspaceId || !websiteId }
  );

  if (isLoading) {
    return (
      <div className="card p-12 text-center text-sm text-surface-400">
        Loading Microsoft Clarity behavioral analytics…
      </div>
    );
  }

  const summary = clarityData?.data?.summary;
  const topPages = clarityData?.data?.topPages || [];
  const deviceBreakdown = clarityData?.data?.deviceBreakdown || [];
  const snapshotWindow = clarityData?.data?.reportingWindow;

  return (
    <div className="space-y-6">
      {/* Microsoft Clarity Data Export API Limit & Reporting Window Banner */}
      <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 text-amber-900 text-xs space-y-1.5">
        <div className="flex items-center gap-2 font-semibold">
          <Info className="w-4 h-4 text-amber-700" />
          <span>Microsoft Clarity Data Export Snapshot Window</span>
        </div>
        <p className="text-amber-800">
          Clarity behavioral statistics reflect rolling snapshots provided via Microsoft Clarity Data Export API (limited to 10 API calls per day per project).
          {snapshotWindow ? (
            <span className="font-semibold ml-1">
              Currently active snapshot: {snapshotWindow.startDate} to {snapshotWindow.endDate} ({snapshotWindow.numOfDays} days, generated at {new Date(snapshotWindow.createdAt).toLocaleString()}).
            </span>
          ) : (
            ' No snapshot window imported yet. Use the Background Sync tab or Import button to fetch recent telemetry.'
          )}
        </p>
      </div>

      {/* Primary Friction Scorecards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricKpiCard
          title="Total Sessions Tracked"
          value={summary?.totalSessions}
          icon={MousePointer}
          iconColor="blue"
          compareEnabled={false}
          subtitle="Clarity snapshot sample"
        />

        <MetricKpiCard
          title="Dead Clicks"
          value={summary?.deadClicks}
          isInverse={true}
          icon={AlertTriangle}
          iconColor="amber"
          compareEnabled={false}
          subtitle={`${Number(summary?.deadClickRate || 0).toFixed(1)}% session rate`}
          tooltip="Clicks on non-clickable page elements (buttons that don't respond, text clicked as links)."
        />

        <MetricKpiCard
          title="Rage Clicks"
          value={summary?.rageClicks}
          isInverse={true}
          icon={Flame}
          iconColor="rose"
          compareEnabled={false}
          subtitle={`${Number(summary?.rageClickRate || 0).toFixed(1)}% session rate`}
          tooltip="Rapid clicks in the same area indicating user frustration or slow responsiveness."
        />

        <MetricKpiCard
          title="Quick Backs"
          value={summary?.quickBacks}
          isInverse={true}
          icon={ArrowLeftRight}
          iconColor="amber"
          compareEnabled={false}
          subtitle="Immediate return to previous page"
          tooltip="User navigated to a page and quickly clicked Back, indicating bad intent match or slow load."
        />

        <MetricKpiCard
          title="Excessive Scroll"
          value={summary?.excessiveScroll}
          isInverse={true}
          icon={TrendingDown}
          iconColor="purple"
          compareEnabled={false}
          subtitle="Users unable to find content"
          tooltip="User scrolled up and down rapidly searching for expected information."
        />

        <MetricKpiCard
          title="Average Scroll Depth"
          value={summary?.scrollDepth}
          format="percent"
          icon={Layers}
          iconColor="emerald"
          compareEnabled={false}
          subtitle="Content visibility reach"
        />

        <MetricKpiCard
          title="Active Engagement Time"
          value={summary?.activeTime}
          format="duration"
          icon={Calendar}
          iconColor="blue"
          compareEnabled={false}
          subtitle="Average active user duration"
        />

        <MetricKpiCard
          title="JavaScript Errors"
          value={summary?.scriptErrors}
          isInverse={true}
          icon={FileCode}
          iconColor="rose"
          compareEnabled={false}
          subtitle="Client-side exceptions logged"
        />
      </div>

      {/* Pages with Friction & Device Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Device Breakdown */}
        <div className="card p-5 space-y-3">
          <h4 className="text-xs font-semibold text-surface-800 uppercase tracking-wider flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-surface-400" />
            <span>Friction by Device</span>
          </h4>
          <BarBreakdownChart
            data={deviceBreakdown.map((d) => ({
              name: d.device || 'Unknown',
              value: (d.deadClicks || 0) + (d.rageClicks || 0),
            }))}
            dataKey="value"
            nameKey="name"
            height={260}
          />
        </div>

        {/* Right: Pages Table */}
        <div className="lg:col-span-2">
          <DataTableWithFilter
            data={topPages}
            columns={[
              {
                key: 'url',
                label: 'Page URL',
                render: (val) => (
                  <span className="font-mono text-brand-700 truncate max-w-sm block" title={val}>
                    {val || '/'}
                  </span>
                ),
              },
              {
                key: 'deadClicks',
                label: 'Dead Clicks',
                sortable: true,
                render: (v) => <span className="font-semibold text-amber-600">{v || 0}</span>,
              },
              {
                key: 'rageClicks',
                label: 'Rage Clicks',
                sortable: true,
                render: (v) => <span className="font-semibold text-rose-600">{v || 0}</span>,
              },
              {
                key: 'quickBacks',
                label: 'Quick Backs',
                sortable: true,
                render: (v) => v || 0,
              },
              {
                key: 'scrollDepth',
                label: 'Avg Scroll %',
                sortable: true,
                render: (v) => (v ? `${Number(v).toFixed(1)}%` : '—'),
              },
            ]}
            searchPlaceholder="Filter pages..."
          />
        </div>
      </div>
    </div>
  );
}
