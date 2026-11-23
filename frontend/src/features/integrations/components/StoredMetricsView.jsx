// frontend/src/features/integrations/components/StoredMetricsView.jsx
import React, { useState } from 'react';
import {
  useGetWebsiteAnalyticsOverviewQuery,
  useGetWebsiteTopQueriesQuery,
  useGetWebsiteTopPagesQuery,
  useGetWebsiteSyncHistoryQuery,
} from '../integrationsApi.js';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  MousePointerClick,
  Eye,
  TrendingUp,
  Award,
  Globe,
  FileText,
  Search,
  History,
  CheckCircle2,
  AlertCircle,
  Database,
} from 'lucide-react';

export default function StoredMetricsView({ workspaceId, websiteId }) {
  const [activeTab, setActiveTab] = useState('queries'); // 'queries' | 'pages' | 'history'

  const { data: overviewData, isLoading: isLoadingOverview } =
    useGetWebsiteAnalyticsOverviewQuery(
      { workspaceId, websiteId },
      { skip: !workspaceId || !websiteId }
    );

  const { data: queriesData, isLoading: isLoadingQueries } = useGetWebsiteTopQueriesQuery(
    { workspaceId, websiteId },
    { skip: !workspaceId || !websiteId }
  );

  const { data: pagesData, isLoading: isLoadingPages } = useGetWebsiteTopPagesQuery(
    { workspaceId, websiteId },
    { skip: !workspaceId || !websiteId }
  );

  const { data: historyData, isLoading: isLoadingHistory } = useGetWebsiteSyncHistoryQuery(
    { workspaceId, websiteId },
    { skip: !workspaceId || !websiteId }
  );

  const overview = overviewData?.data;
  const ga4 = overview?.ga4Summary;
  const gsc = overview?.gscSummary;
  const timeSeries = overview?.timeSeries || [];
  const topQueries = queriesData?.data?.data || [];
  const topPages = pagesData?.data?.data || [];
  const syncHistory = historyData?.data || [];

  if (isLoadingOverview) {
    return (
      <div className="card p-12 text-center text-sm text-surface-400">
        Loading locally stored SEO performance data…
      </div>
    );
  }

  const hasData = timeSeries.length > 0 || (ga4?.sessions || 0) > 0 || (gsc?.clicks || 0) > 0;

  if (!hasData) {
    return (
      <div className="card p-8 text-center">
        <Database className="w-10 h-10 text-surface-300 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-surface-900">No Historical Data Stored Yet</h3>
        <p className="text-sm text-surface-500 max-w-md mx-auto mt-1 mb-4">
          Connect your GA4 and Google Search Console properties above and click <strong>"Import Data"</strong> to retrieve and store records in your local database.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* GA4 Sessions */}
        <div className="card p-4">
          <div className="flex items-center justify-between text-surface-500 mb-1">
            <span className="text-xs font-medium">GA4 Sessions</span>
            <Globe className="w-4 h-4 text-brand-600" />
          </div>
          <div className="text-2xl font-bold text-surface-900">
            {(ga4?.sessions || 0).toLocaleString()}
          </div>
          <div className="text-xs text-surface-500 mt-1">
            Organic: <strong className="text-surface-700">{(ga4?.organicSessions || 0).toLocaleString()}</strong>
          </div>
        </div>

        {/* GSC Clicks */}
        <div className="card p-4">
          <div className="flex items-center justify-between text-surface-500 mb-1">
            <span className="text-xs font-medium">Organic Clicks</span>
            <MousePointerClick className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-surface-900">
            {(gsc?.clicks || 0).toLocaleString()}
          </div>
          <div className="text-xs text-surface-500 mt-1">
            CTR: <strong className="text-surface-700">{gsc?.ctr || 0}%</strong>
          </div>
        </div>

        {/* GSC Impressions */}
        <div className="card p-4">
          <div className="flex items-center justify-between text-surface-500 mb-1">
            <span className="text-xs font-medium">Search Impressions</span>
            <Eye className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-bold text-surface-900">
            {(gsc?.impressions || 0).toLocaleString()}
          </div>
          <div className="text-xs text-surface-500 mt-1">
            Avg Pos: <strong className="text-surface-700">{gsc?.avgPosition || 0}</strong>
          </div>
        </div>

        {/* Conversions / Engagement */}
        <div className="card p-4">
          <div className="flex items-center justify-between text-surface-500 mb-1">
            <span className="text-xs font-medium">Engagement & Conv.</span>
            <Award className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-surface-900">
            {(ga4?.conversions || 0).toLocaleString()}
          </div>
          <div className="text-xs text-surface-500 mt-1">
            Rate: <strong className="text-surface-700">{((ga4?.avgEngagementRate || 0) * 100).toFixed(1)}%</strong>
          </div>
        </div>
      </div>

      {/* Daily Performance Trend Chart */}
      {timeSeries.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-surface-900">
                Daily Performance Trends (Stored Data)
              </h3>
              <p className="text-xs text-surface-500">
                Comparison of GA4 total sessions and Google Search Console organic search clicks
              </p>
            </div>
            <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-mono">
              Offline Available
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(val) => val.slice(5)}
                />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#e2e8f0',
                    borderRadius: '0.5rem',
                    fontSize: '0.75rem',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '10px' }} />
                <Line
                  type="monotone"
                  dataKey="sessions"
                  name="GA4 Sessions"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="clicks"
                  name="GSC Clicks"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Granular Breakdown Tabs */}
      <div className="card">
        {/* Tab Headers */}
        <div className="border-b border-surface-200 flex items-center px-6 pt-4 gap-6">
          <button
            onClick={() => setActiveTab('queries')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'queries'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Top Queries ({topQueries.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('pages')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'pages'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Top Landing Pages ({topPages.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'history'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Sync History ({syncHistory.length})</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-6">
          {activeTab === 'queries' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-100 text-xs text-surface-400 font-semibold uppercase tracking-wider">
                    <th className="pb-3">Search Query (Keyword)</th>
                    <th className="pb-3 text-right">Clicks</th>
                    <th className="pb-3 text-right">Impressions</th>
                    <th className="pb-3 text-right">CTR</th>
                    <th className="pb-3 text-right">Avg Position</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 text-surface-700">
                  {topQueries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-surface-400">
                        No search queries recorded yet.
                      </td>
                    </tr>
                  ) : (
                    topQueries.map((q, idx) => (
                      <tr key={idx} className="hover:bg-surface-50/50">
                        <td className="py-2.5 font-medium text-surface-900">{q.query}</td>
                        <td className="py-2.5 text-right font-semibold text-emerald-600">
                          {q.clicks.toLocaleString()}
                        </td>
                        <td className="py-2.5 text-right">{q.impressions.toLocaleString()}</td>
                        <td className="py-2.5 text-right font-mono text-xs">{q.ctr}%</td>
                        <td className="py-2.5 text-right font-mono text-xs">{q.avgPosition}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'pages' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-100 text-xs text-surface-400 font-semibold uppercase tracking-wider">
                    <th className="pb-3">Landing Page</th>
                    <th className="pb-3 text-right">Sessions</th>
                    <th className="pb-3 text-right">Users</th>
                    <th className="pb-3 text-right">Conversions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 text-surface-700">
                  {topPages.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-surface-400">
                        No landing pages recorded yet.
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
                        <td className="py-2.5 text-right">{p.users.toLocaleString()}</td>
                        <td className="py-2.5 text-right font-mono text-xs">{p.conversions}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-100 text-xs text-surface-400 font-semibold uppercase tracking-wider">
                    <th className="pb-3">Execution Time</th>
                    <th className="pb-3">Integration</th>
                    <th className="pb-3">Date Range</th>
                    <th className="pb-3 text-right">Fetched</th>
                    <th className="pb-3 text-right">Inserted</th>
                    <th className="pb-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 text-surface-700">
                  {syncHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-xs text-surface-400">
                        No synchronization events recorded yet.
                      </td>
                    </tr>
                  ) : (
                    syncHistory.map((h) => (
                      <tr key={h.id} className="hover:bg-surface-50/50">
                        <td className="py-2.5 text-xs text-surface-600">
                          {new Date(h.startedAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 font-semibold text-xs text-surface-900">
                          {h.integrationType}
                        </td>
                        <td className="py-2.5 text-xs text-surface-500 font-mono">
                          {h.dateRangeStart} → {h.dateRangeEnd}
                        </td>
                        <td className="py-2.5 text-right text-xs font-mono">{h.rowsFetched}</td>
                        <td className="py-2.5 text-right text-xs font-mono font-semibold text-emerald-600">
                          {h.rowsInserted}
                        </td>
                        <td className="py-2.5 text-right">
                          <span
                            className={`text-2xs px-2 py-0.5 rounded font-semibold ${
                              h.status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {h.status}
                          </span>
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
    </div>
  );
}
