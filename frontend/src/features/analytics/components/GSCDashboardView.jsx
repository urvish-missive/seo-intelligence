// frontend/src/features/analytics/components/GSCDashboardView.jsx
import React, { useState } from 'react';
import {
  MousePointerClick,
  Eye,
  TrendingUp,
  Award,
  Search,
  FileText,
  Smartphone,
  Globe,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import MetricKpiCard from './MetricKpiCard.jsx';
import TrendLineChart from './TrendLineChart.jsx';
import BarBreakdownChart from './BarBreakdownChart.jsx';
import DataTableWithFilter from './DataTableWithFilter.jsx';
import {
  useGetGSCSummaryQuery,
  useGetGSCQueriesQuery,
  useGetGSCPagesQuery,
  useGetGSCBreakdownQuery,
  useGetGSCOpportunitiesQuery,
} from '../analyticsApi.js';

export default function GSCDashboardView({
  workspaceId,
  websiteId,
  dateRange,
}) {
  const [activeSubTab, setActiveSubTab] = useState('queries'); // 'queries' | 'pages' | 'breakdowns' | 'opportunities'

  // Query filters state
  const [querySearch, setQuerySearch] = useState('');
  const [queryMinClicks, setQueryMinClicks] = useState('');
  const [queryMinImpressions, setQueryMinImpressions] = useState('');
  const [queriesOffset, setQueriesOffset] = useState(0);

  // Pages filters state
  const [pagesSearch, setPagesSearch] = useState('');
  const [pagesOffset, setPagesOffset] = useState(0);

  // Breakdown dimension
  const [breakdownDim, setBreakdownDim] = useState('device');

  const pageSize = 25;

  // 1. GSC Summary
  const { data: summaryData, isLoading: isLoadingSummary } = useGetGSCSummaryQuery(
    {
      workspaceId,
      websiteId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      compare: dateRange.compare,
    },
    { skip: !workspaceId || !websiteId || !dateRange.startDate }
  );

  // 2. GSC Queries
  const { data: queriesData, isLoading: isLoadingQueries } = useGetGSCQueriesQuery(
    {
      workspaceId,
      websiteId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      limit: pageSize,
      offset: queriesOffset,
      search: querySearch,
      minClicks: queryMinClicks,
      minImpressions: queryMinImpressions,
    },
    { skip: !workspaceId || !websiteId || !dateRange.startDate }
  );

  // 3. GSC Pages
  const { data: pagesData, isLoading: isLoadingPages } = useGetGSCPagesQuery(
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

  // 4. GSC Breakdown
  const { data: breakdownData, isLoading: isLoadingBreakdown } = useGetGSCBreakdownQuery(
    {
      workspaceId,
      websiteId,
      dimension: breakdownDim,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    },
    { skip: !workspaceId || !websiteId || !dateRange.startDate }
  );

  // 5. GSC Opportunities
  const { data: oppsData, isLoading: isLoadingOpps } = useGetGSCOpportunitiesQuery(
    {
      workspaceId,
      websiteId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    },
    { skip: !workspaceId || !websiteId || !dateRange.startDate }
  );

  const summary = summaryData?.data?.summary;
  const timeSeries = summaryData?.data?.timeSeries || [];
  const queries = queriesData?.data?.queries || [];
  const totalQueriesCount = queriesData?.data?.pagination?.total || 0;
  const pages = pagesData?.data?.pages || [];
  const totalPagesCount = pagesData?.data?.pagination?.total || 0;
  const breakdownItems = breakdownData?.data?.breakdown || [];
  const opportunities = oppsData?.data?.opportunities || { lowCtrHighImpression: [], strikingDistance: [] };

  if (isLoadingSummary) {
    return (
      <div className="card p-12 text-center text-sm text-surface-400">
        Loading Google Search Console metrics…
      </div>
    );
  }

  const deltas = summary?.comparison?.deltas || {};

  return (
    <div className="space-y-6">
      {/* 4 Primary GSC KPI Scorecards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricKpiCard
          title="Total Clicks"
          value={summary?.totalClicks}
          previousValue={summary?.comparison?.totalClicks}
          changePercentage={deltas?.clicks?.percentage}
          icon={MousePointerClick}
          iconColor="blue"
          compareEnabled={dateRange.compare}
          tooltip="Total organic clicks from Google Search results."
        />

        <MetricKpiCard
          title="Total Impressions"
          value={summary?.totalImpressions}
          previousValue={summary?.comparison?.totalImpressions}
          changePercentage={deltas?.impressions?.percentage}
          icon={Eye}
          iconColor="purple"
          compareEnabled={dateRange.compare}
          tooltip="Total impressions across all indexed URLs in search results."
        />

        <MetricKpiCard
          title="Aggregate CTR"
          value={summary?.averageCtr}
          previousValue={summary?.comparison?.averageCtr}
          changePercentage={deltas?.ctr?.percentage}
          format="percent"
          icon={TrendingUp}
          iconColor="emerald"
          compareEnabled={dateRange.compare}
          tooltip="Weighted CTR = (Total Clicks / Total Impressions) * 100."
        />

        <MetricKpiCard
          title="Weighted Avg Position"
          value={summary?.averagePosition}
          previousValue={summary?.comparison?.averagePosition}
          changePercentage={deltas?.position?.percentage}
          format="rank"
          isInverse={true}
          icon={Award}
          iconColor="blue"
          compareEnabled={dateRange.compare}
          tooltip="Impression-weighted average ranking. Lower number = higher on Google."
        />
      </div>

      {/* Dual Performance Trend Chart */}
      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-surface-900">
          Daily Search Clicks & Impressions
        </h3>
        <TrendLineChart
          data={timeSeries}
          height={280}
          series={[
            { key: 'clicks', name: 'Clicks (Current)', stroke: '#2563eb', strokeWidth: 2.5 },
            { key: 'impressions', name: 'Impressions (Current)', stroke: '#8b5cf6', strokeWidth: 2 },
            { key: 'prev_clicks', name: 'Clicks (Previous)', stroke: '#93c5fd', strokeDasharray: '4 4' },
            { key: 'prev_impressions', name: 'Impressions (Previous)', stroke: '#ddd6fe', strokeDasharray: '4 4' },
          ]}
        />
      </div>

      {/* Sub-Tabs: Queries, Pages, Breakdowns, Opportunities */}
      <div className="space-y-4">
        <div className="border-b border-surface-200 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => setActiveSubTab('queries')}
            className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeSubTab === 'queries'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Top Queries</span>
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
            <span>Top Pages</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('breakdowns')}
            className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeSubTab === 'breakdowns'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Device & Geography</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('opportunities')}
            className={`pb-2.5 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeSubTab === 'opportunities'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Search Opportunities</span>
          </button>
        </div>

        {/* 1. TOP QUERIES TAB */}
        {activeSubTab === 'queries' && (
          <DataTableWithFilter
            data={queries}
            totalCount={totalQueriesCount}
            page={Math.floor(queriesOffset / pageSize) + 1}
            pageSize={pageSize}
            onPageChange={(p) => setQueriesOffset((p - 1) * pageSize)}
            search={querySearch}
            onSearchChange={(v) => {
              setQuerySearch(v);
              setQueriesOffset(0);
            }}
            searchPlaceholder="Search keywords / queries..."
            isLoading={isLoadingQueries}
            filtersNode={
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="number"
                  placeholder="Min Clicks"
                  value={queryMinClicks}
                  onChange={(e) => {
                    setQueryMinClicks(e.target.value);
                    setQueriesOffset(0);
                  }}
                  className="w-24 px-2 py-1 bg-white border border-surface-200 rounded-lg text-xs"
                />
                <input
                  type="number"
                  placeholder="Min Impr."
                  value={queryMinImpressions}
                  onChange={(e) => {
                    setQueryMinImpressions(e.target.value);
                    setQueriesOffset(0);
                  }}
                  className="w-24 px-2 py-1 bg-white border border-surface-200 rounded-lg text-xs"
                />
              </div>
            }
            columns={[
              {
                key: 'query',
                label: 'Search Query',
                sortable: true,
                render: (val) => (
                  <span className="font-semibold text-surface-900">{val}</span>
                ),
              },
              {
                key: 'clicks',
                label: 'Clicks',
                sortable: true,
                render: (v) => <span className="font-bold text-surface-900">{v.toLocaleString()}</span>,
              },
              {
                key: 'impressions',
                label: 'Impressions',
                sortable: true,
                render: (v) => v.toLocaleString(),
              },
              {
                key: 'ctr',
                label: 'CTR',
                sortable: true,
                render: (v) => `${Number(v).toFixed(2)}%`,
              },
              {
                key: 'position',
                label: 'Avg Position',
                sortable: true,
                render: (v) => (
                  <span
                    className={`font-mono text-2xs px-1.5 py-0.5 rounded font-semibold ${
                      v <= 3
                        ? 'bg-emerald-100 text-emerald-800'
                        : v <= 10
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-surface-100 text-surface-700'
                    }`}
                  >
                    {Number(v).toFixed(1)}
                  </span>
                ),
              },
            ]}
          />
        )}

        {/* 2. TOP PAGES TAB */}
        {activeSubTab === 'pages' && (
          <DataTableWithFilter
            data={pages}
            totalCount={totalPagesCount}
            page={Math.floor(pagesOffset / pageSize) + 1}
            pageSize={pageSize}
            onPageChange={(p) => setPagesOffset((p - 1) * pageSize)}
            search={pagesSearch}
            onSearchChange={(v) => {
              setPagesSearch(v);
              setPagesOffset(0);
            }}
            searchPlaceholder="Search pages by URL..."
            isLoading={isLoadingPages}
            columns={[
              {
                key: 'page',
                label: 'Page URL',
                sortable: true,
                render: (val) => (
                  <span className="font-mono text-brand-700 truncate max-w-lg block" title={val}>
                    {val}
                  </span>
                ),
              },
              {
                key: 'clicks',
                label: 'Clicks',
                sortable: true,
                render: (v) => <span className="font-bold">{v.toLocaleString()}</span>,
              },
              {
                key: 'impressions',
                label: 'Impressions',
                sortable: true,
                render: (v) => v.toLocaleString(),
              },
              {
                key: 'ctr',
                label: 'CTR',
                sortable: true,
                render: (v) => `${Number(v).toFixed(2)}%`,
              },
              {
                key: 'position',
                label: 'Avg Pos',
                sortable: true,
                render: (v) => Number(v).toFixed(1),
              },
            ]}
          />
        )}

        {/* 3. BREAKDOWNS TAB */}
        {activeSubTab === 'breakdowns' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBreakdownDim('device')}
                className={`btn-sm text-xs ${
                  breakdownDim === 'device' ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                Device Breakdown
              </button>
              <button
                type="button"
                onClick={() => setBreakdownDim('country')}
                className={`btn-sm text-xs ${
                  breakdownDim === 'country' ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                Country Breakdown
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="card p-5 space-y-3">
                <h4 className="text-xs font-semibold text-surface-800 uppercase tracking-wider">
                  {breakdownDim === 'device' ? 'Clicks by Device' : 'Clicks by Country'}
                </h4>
                <BarBreakdownChart
                  data={breakdownItems.map((b) => ({
                    name: b.name || b.key,
                    value: b.clicks,
                  }))}
                  dataKey="value"
                  nameKey="name"
                  height={240}
                />
              </div>

              <div className="lg:col-span-2">
                <DataTableWithFilter
                  data={breakdownItems}
                  columns={[
                    {
                      key: 'name',
                      label: breakdownDim === 'device' ? 'Device' : 'Country Code',
                      render: (v) => <span className="font-semibold capitalize">{v}</span>,
                    },
                    {
                      key: 'clicks',
                      label: 'Clicks',
                      sortable: true,
                      render: (v) => v.toLocaleString(),
                    },
                    {
                      key: 'impressions',
                      label: 'Impressions',
                      sortable: true,
                      render: (v) => v.toLocaleString(),
                    },
                    {
                      key: 'ctr',
                      label: 'CTR',
                      sortable: true,
                      render: (v) => `${Number(v).toFixed(2)}%`,
                    },
                    {
                      key: 'position',
                      label: 'Avg Position',
                      sortable: true,
                      render: (v) => Number(v).toFixed(1),
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        )}

        {/* 4. OPPORTUNITIES TAB */}
        {activeSubTab === 'opportunities' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Low CTR High Impression Opportunities */}
            <div className="card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h4 className="text-sm font-semibold text-surface-900">
                  High Impressions, Low CTR (&lt; 3%)
                </h4>
              </div>
              <p className="text-xs text-surface-500">
                Queries where pages appear frequently in search results but attract few clicks. Optimize titles & meta descriptions to boost traffic.
              </p>
              <div className="divide-y divide-surface-100 max-h-96 overflow-y-auto">
                {opportunities.lowCtrHighImpression.length === 0 ? (
                  <div className="text-xs text-surface-400 py-6 text-center">
                    No low-CTR queries detected in this period.
                  </div>
                ) : (
                  opportunities.lowCtrHighImpression.map((item, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-surface-800">{item.query}</div>
                        <div className="text-2xs text-surface-400">
                          {item.impressions.toLocaleString()} imp · Position {Number(item.position).toFixed(1)}
                        </div>
                      </div>
                      <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-mono text-2xs font-semibold">
                        {Number(item.ctr).toFixed(2)}% CTR
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Striking Distance Opportunities */}
            <div className="card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                <h4 className="text-sm font-semibold text-surface-900">
                  Striking Distance Keywords (Positions 4–15)
                </h4>
              </div>
              <p className="text-xs text-surface-500">
                Keywords hovering right below top positions. Minor on-page enhancements or internal linking could push these onto the first page or top 3!
              </p>
              <div className="divide-y divide-surface-100 max-h-96 overflow-y-auto">
                {opportunities.strikingDistance.length === 0 ? (
                  <div className="text-xs text-surface-400 py-6 text-center">
                    No striking distance queries found in this period.
                  </div>
                ) : (
                  opportunities.strikingDistance.map((item, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-surface-800">{item.query}</div>
                        <div className="text-2xs text-surface-400">
                          {item.clicks.toLocaleString()} clicks · {item.impressions.toLocaleString()} imp
                        </div>
                      </div>
                      <span className="text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded font-mono text-2xs font-semibold">
                        Rank #{Number(item.position).toFixed(1)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
