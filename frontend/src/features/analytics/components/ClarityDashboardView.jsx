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
  Clock,
  Users,
  FileText,
} from 'lucide-react';
import MetricKpiCard from './MetricKpiCard.jsx';
import BarBreakdownChart from './BarBreakdownChart.jsx';
import DataTableWithFilter from './DataTableWithFilter.jsx';
import TrendLineChart from './TrendLineChart.jsx';
import { useGetClaritySummaryQuery } from '../analyticsApi.js';

export default function ClarityDashboardView({ workspaceId, websiteId, dateRange }) {
  const { data: clarityData, isLoading, isFetching } = useGetClaritySummaryQuery(
    { workspaceId, websiteId, startDate: dateRange?.startDate, endDate: dateRange?.endDate },
    { skip: !workspaceId || !websiteId || !dateRange?.startDate }
  );

  if (isLoading) {
    return (
      <div className="card p-12 text-center text-sm text-surface-400">
        Loading Microsoft Clarity behavioural analytics…
      </div>
    );
  }

  const data = clarityData?.data || {};
  const f = data.friction || {};
  const topPages = data.topPages || [];
  const deviceBreakdown = data.deviceBreakdown || [];
  const dailyTrend = data.dailyTrend || [];
  const lastImport = data.reportingWindow?.lastImportAt;
  const coverage = data.coverage;
  const fmtWhen = (d) =>
    new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`space-y-6 ${isFetching ? 'opacity-70 transition-opacity' : ''}`}>
      <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 text-amber-900 text-xs space-y-1">
        <div className="flex items-center gap-2 font-semibold">
          <Info className="w-4 h-4 text-amber-700" />
          <span>How Clarity history works</span>
        </div>
        <p className="text-amber-800">
          {coverage ? (
            <>
              These numbers cover <span className="font-semibold">{fmtWhen(coverage.from)} – {fmtWhen(coverage.to)}</span>
              {coverage.imports > 1 ? ` (${coverage.imports} imports)` : ''}. Compare them with Clarity&apos;s own dashboard set to the same
              window. Clarity only exports the last 1–3 days, so longer history builds up from the daily sync.
            </>
          ) : (
            'No Clarity import covers this period yet. Clarity only exports the last 1–3 days, so run a sync to fetch recent data; history then builds up from the daily sync.'
          )}
          {lastImport && ` Last import: ${new Date(lastImport).toLocaleString()}.`}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricKpiCard
          title="Sessions"
          value={f.totalSessions}
          icon={MousePointer}
          iconColor="blue"
          compareEnabled={false}
          subtitle={f.botSessions ? `${Number(f.botSessions).toLocaleString()} bot sessions excluded` : 'Recorded by Clarity'}
        />
        <MetricKpiCard title="Unique Users" value={f.distinctUsers} icon={Users} iconColor="purple" compareEnabled={false} />
        <MetricKpiCard title="Pages per Session" value={f.pagesPerSession} format="decimal" icon={FileText} iconColor="blue" compareEnabled={false} subtitle="average" />
        <MetricKpiCard
          title="Dead Clicks"
          value={f.deadClickCount}
          isInverse
          icon={AlertTriangle}
          iconColor="amber"
          compareEnabled={false}
          subtitle={`${Number(f.deadClickRate || 0).toFixed(1)} per 100 sessions`}
          tooltip="Clicks on elements that do nothing."
        />
        <MetricKpiCard
          title="Rage Clicks"
          value={f.rageClickCount}
          isInverse
          icon={Flame}
          iconColor="rose"
          compareEnabled={false}
          subtitle={`${Number(f.rageClickRate || 0).toFixed(1)} per 100 sessions`}
          tooltip="Rapid repeated clicks in one spot, a sign of frustration."
        />
        <MetricKpiCard
          title="Quick Backs"
          value={f.quickbackClickCount}
          isInverse
          icon={ArrowLeftRight}
          iconColor="amber"
          compareEnabled={false}
          subtitle={`${Number(f.quickbackRate || 0).toFixed(1)} per 100 sessions`}
          tooltip="Visitor opened a page and went straight back."
        />
        <MetricKpiCard
          title="Excessive Scroll"
          value={f.excessiveScrollCount}
          isInverse
          icon={TrendingDown}
          iconColor="purple"
          compareEnabled={false}
          tooltip="Rapid up-and-down scrolling while searching for content."
        />
        <MetricKpiCard title="Avg Scroll Depth" value={f.avgScrollDepth} format="percent" icon={Layers} iconColor="emerald" compareEnabled={false} />
        <MetricKpiCard
          title="Active Time Spent"
          value={f.avgTimeOnPageSec}
          format="duration"
          icon={Clock}
          iconColor="blue"
          compareEnabled={false}
          subtitle={f.totalTimeSec ? `out of ${(f.totalTimeSec / 60).toFixed(1)} min total time` : undefined}
        />
        <MetricKpiCard
          title="Script Errors"
          value={f.scriptErrorCount}
          isInverse
          icon={FileCode}
          iconColor="rose"
          compareEnabled={false}
          subtitle={`${Number(f.scriptErrorRate || 0).toFixed(1)} per 100 sessions`}
        />
      </div>

      {dailyTrend.length > 1 && (
        <div className="card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-surface-900">Daily Sessions & Friction</h3>
          <TrendLineChart
            data={dailyTrend}
            height={260}
            series={[
              { key: 'sessions', name: 'Sessions', stroke: '#2563eb', strokeWidth: 2.5 },
              { key: 'deadClickCount', name: 'Dead clicks', stroke: '#f59e0b', strokeWidth: 2 },
              { key: 'rageClickCount', name: 'Rage clicks', stroke: '#e11d48', strokeWidth: 2 },
            ]}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5 space-y-3">
          <h4 className="text-xs font-semibold text-surface-800 uppercase tracking-wider flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-surface-400" />
            <span>Sessions by Device</span>
          </h4>
          <BarBreakdownChart
            data={deviceBreakdown.map((d) => ({ name: d.device || 'Unknown', value: d.sessions || 0 }))}
            dataKey="value"
            nameKey="name"
            height={260}
            emptyMessage="Run a Clarity sync to see device data."
          />
        </div>

        <div className="lg:col-span-2">
          <DataTableWithFilter
            data={topPages}
            emptyMessage="No page data yet. Run a Clarity sync with the URL preset for per-page friction."
            columns={[
              {
                key: 'page',
                label: 'Page URL',
                render: (val) => (
                  <span className="font-mono text-brand-700 truncate max-w-sm block" title={val}>
                    {val || '/'}
                  </span>
                ),
              },
              { key: 'sessions', label: 'Sessions', sortable: true, render: (v) => (v || 0).toLocaleString() },
              { key: 'deadClicks', label: 'Dead Clicks', sortable: true, render: (v) => <span className="font-semibold text-amber-600">{v || 0}</span> },
              { key: 'rageClicks', label: 'Rage Clicks', sortable: true, render: (v) => <span className="font-semibold text-rose-600">{v || 0}</span> },
              { key: 'quickBacks', label: 'Quick Backs', sortable: true, render: (v) => v || 0 },
              { key: 'avgScrollDepth', label: 'Avg Scroll', sortable: true, render: (v) => (v ? `${Number(v).toFixed(1)}%` : '—') },
            ]}
            searchPlaceholder="Filter pages…"
          />
        </div>
      </div>
    </div>
  );
}
