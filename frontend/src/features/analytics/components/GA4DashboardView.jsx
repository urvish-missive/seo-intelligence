// frontend/src/features/analytics/components/GA4DashboardView.jsx
import React, { useState } from 'react';
import {
  Users,
  Activity,
  Globe,
  Clock,
  ArrowDownRight,
  TrendingUp,
  Target,
  Layers,
  FileText,
} from 'lucide-react';
import MetricKpiCard from './MetricKpiCard.jsx';
import TrendLineChart from './TrendLineChart.jsx';
import BarBreakdownChart from './BarBreakdownChart.jsx';
import DataTableWithFilter from './DataTableWithFilter.jsx';
import {
  useGetGA4SummaryQuery,
  useGetGA4SourcesQuery,
  useGetGA4LandingPagesQuery,
} from '../analyticsApi.js';

export default function GA4DashboardView({
  workspaceId,
  websiteId,
  dateRange,
}) {
  const [activeSubTab, setActiveSubTab] = useState('sources'); // 'sources' | 'pages'
  const [pagesSearch, setPagesSearch] = useState('');
  const [pagesOffset, setPagesOffset] = useState(0);
  const pageSize = 15;

  // 1. GA4 Summary
  const { data: summaryData, isLoading: isLoadingSummary } = useGetGA4SummaryQuery(
    {
      workspaceId,
      websiteId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      compare: dateRange.compare,
    },
    { skip: !workspaceId || !websiteId || !dateRange.startDate }
  );

  // 2. GA4 Sources
  const { data: sourcesData, isLoading: isLoadingSources } = useGetGA4SourcesQuery(
    {
      workspaceId,
      websiteId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      limit: 25,
    },
    { skip: !workspaceId || !websiteId || !dateRange.startDate }
  );

  // 3. GA4 Landing Pages
  const { data: landingPagesData, isLoading: isLoadingPages } = useGetGA4LandingPagesQuery(
    {
      workspaceId,
      websiteId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      limit: pageSize,
      offset: pagesOffset,
      search: pagesSearch,
    },
    { skip: !workspaceId || !websiteId || !dateRange.startDate }
  );

  const summary = summaryData?.data?.summary;
  const timeSeries = summaryData?.data?.timeSeries || [];
  const sources = sourcesData?.data?.sources || [];
  const landingPages = landingPagesData?.data?.pages || [];
  const totalPagesCount = landingPagesData?.data?.pagination?.total || 0;

  if (isLoadingSummary) {
    return (
      <div className="card p-12 text-center text-sm text-surface-400">
        Loading Google Analytics 4 intelligence…
      </div>
    );
  }

  const deltas = summary?.comparison?.deltas || {};

  return (
    <div className="space-y-6">
      {/* 8 Primary GA4 Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricKpiCard
          title="Total Users"
          value={summary?.totalUsers}
          previousValue={summary?.comparison?.totalUsers}
          changePercentage={deltas?.users?.percentage}
          icon={Users}
          iconColor="blue"
          compareEnabled={dateRange.compare}
        />

        <MetricKpiCard
          title="Total Sessions"
          value={summary?.totalSessions}
          previousValue={summary?.comparison?.totalSessions}
          changePercentage={deltas?.sessions?.percentage}
          icon={Activity}
          iconColor="blue"
          compareEnabled={dateRange.compare}
        />

        <MetricKpiCard
          title="Organic Sessions"
          value={summary?.organicSessions}
          previousValue={summary?.comparison?.organicSessions}
          changePercentage={deltas?.organicSessions?.percentage}
          icon={Globe}
          iconColor="emerald"
          compareEnabled={dateRange.compare}
        />

        <MetricKpiCard
          title="Engaged Sessions"
          value={summary?.engagedSessions}
          previousValue={summary?.comparison?.engagedSessions}
          changePercentage={deltas?.engagedSessions?.percentage}
          icon={TrendingUp}
          iconColor="emerald"
          compareEnabled={dateRange.compare}
        />

        <MetricKpiCard
          title="Engagement Rate"
          value={summary?.engagementRate}
          previousValue={summary?.comparison?.engagementRate}
          changePercentage={deltas?.engagementRate?.percentage}
          format="percent"
          icon={Target}
          iconColor="emerald"
          compareEnabled={dateRange.compare}
        />

        <MetricKpiCard
          title="Avg Engagement Time"
          value={summary?.averageEngagementTime}
          previousValue={summary?.comparison?.averageEngagementTime}
          changePercentage={deltas?.averageEngagementTime?.percentage}
          format="duration"
          icon={Clock}
          iconColor="purple"
          compareEnabled={dateRange.compare}
        />

        <MetricKpiCard
          title="Bounce Rate"
          value={summary?.bounceRate}
          previousValue={summary?.comparison?.bounceRate}
          changePercentage={deltas?.bounceRate?.percentage}
          format="percent"
          isInverse={true}
          icon={ArrowDownRight}
          iconColor="amber"
          compareEnabled={dateRange.compare}
        />

        <MetricKpiCard
          title="Conversions"
          value={summary?.conversions}
          previousValue={summary?.comparison?.conversions}
          changePercentage={deltas?.conversions?.percentage}
          icon={Target}
          iconColor="emerald"
          compareEnabled={dateRange.compare}
        />
      </div>

      {/* Traffic Trend Chart */}
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-surface-900">
          Daily Sessions & Organic Traffic
        </h3>
        <TrendLineChart
          data={timeSeries}
          height={280}
          series={[
            { key: 'sessions', name: 'Sessions (Current)', stroke: '#2563eb', strokeWidth: 2.5 },
            { key: 'organicSessions', name: 'Organic (Current)', stroke: '#10b981', strokeWidth: 2 },
            { key: 'prev_sessions', name: 'Sessions (Previous)', stroke: '#93c5fd', strokeDasharray: '4 4' },
            { key: 'prev_organicSessions', name: 'Organic (Previous)', stroke: '#a7f3d0', strokeDasharray: '4 4' },
          ]}
        />
      </div>

      {/* Sub-Tabs: Traffic Channels vs Landing Pages */}
      <div className="space-y-4">
        <div className="border-b border-surface-200 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setActiveSubTab('sources')}
            className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeSubTab === 'sources'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Traffic Channels & Sources ({sources.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('pages')}
            className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeSubTab === 'pages'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Top Landing Pages</span>
          </button>
        </div>

        {/* Channels Tab */}
        {activeSubTab === 'sources' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Bar Breakdown */}
            <div className="card p-5 space-y-3">
              <h4 className="text-xs font-semibold text-surface-800 uppercase tracking-wider">
                Top Acquisition Channels
              </h4>
              <BarBreakdownChart
                data={sources.slice(0, 6).map((s) => ({
                  name: s.channelGroup || s.sourceMedium || 'Direct',
                  value: s.sessions,
                }))}
                dataKey="value"
                nameKey="name"
                height={260}
              />
            </div>

            {/* Right: Sources Table */}
            <div className="lg:col-span-2">
              <DataTableWithFilter
                data={sources}
                columns={[
                  {
                    key: 'channelGroup',
                    label: 'Default Channel',
                    sortable: true,
                    render: (val, r) => (
                      <div>
                        <div className="font-semibold text-surface-900">{val || 'Direct'}</div>
                        <div className="text-2xs text-surface-400 font-mono">{r.sourceMedium}</div>
                      </div>
                    ),
                  },
                  {
                    key: 'sessions',
                    label: 'Sessions',
                    sortable: true,
                    render: (v) => <span className="font-semibold">{v.toLocaleString()}</span>,
                  },
                  {
                    key: 'organicSessions',
                    label: 'Organic',
                    sortable: true,
                    render: (v) => <span className="text-emerald-700">{v.toLocaleString()}</span>,
                  },
                  {
                    key: 'users',
                    label: 'Users',
                    sortable: true,
                    render: (v) => v.toLocaleString(),
                  },
                  {
                    key: 'conversions',
                    label: 'Conversions',
                    sortable: true,
                    render: (v) => v.toLocaleString(),
                  },
                ]}
                searchPlaceholder="Search sources..."
              />
            </div>
          </div>
        )}

        {/* Landing Pages Tab */}
        {activeSubTab === 'pages' && (
          <DataTableWithFilter
            data={landingPages}
            totalCount={totalPagesCount}
            page={Math.floor(pagesOffset / pageSize) + 1}
            pageSize={pageSize}
            onPageChange={(p) => setPagesOffset((p - 1) * pageSize)}
            search={pagesSearch}
            onSearchChange={(v) => {
              setPagesSearch(v);
              setPagesOffset(0);
            }}
            searchPlaceholder="Search landing pages by URL path..."
            isLoading={isLoadingPages}
            columns={[
              {
                key: 'pagePath',
                label: 'Landing Page URL',
                sortable: true,
                render: (val) => (
                  <span className="font-mono text-brand-700 truncate max-w-md block" title={val}>
                    {val || '/'}
                  </span>
                ),
              },
              {
                key: 'sessions',
                label: 'Sessions',
                sortable: true,
                render: (v) => <span className="font-semibold">{v.toLocaleString()}</span>,
              },
              {
                key: 'engagedSessions',
                label: 'Engaged',
                sortable: true,
                render: (v) => v.toLocaleString(),
              },
              {
                key: 'engagementRate',
                label: 'Engagement %',
                sortable: true,
                render: (v) => `${Number(v).toFixed(1)}%`,
              },
              {
                key: 'conversions',
                label: 'Conversions',
                sortable: true,
                render: (v) => v.toLocaleString(),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
