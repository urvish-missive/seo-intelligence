// frontend/src/features/analytics/components/CrossPlatformOverviewView.jsx
import React from 'react';
import {
  Users,
  Globe,
  MousePointerClick,
  Eye,
  Award,
  AlertTriangle,
  Flame,
  Activity,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import MetricKpiCard from './MetricKpiCard.jsx';
import TrendLineChart from './TrendLineChart.jsx';

export default function CrossPlatformOverviewView({
  data,
  isLoading,
  compareEnabled,
}) {
  if (isLoading) {
    return (
      <div className="card p-12 text-center text-sm text-surface-400">
        Loading cross-platform SEO intelligence…
      </div>
    );
  }

  const ga4 = data?.ga4Summary;
  const gsc = data?.gscSummary;
  const clarity = data?.claritySummary;
  const timeSeries = data?.timeSeries || [];
  const providers = data?.providers || {};

  return (
    <div className="space-y-6">
      {/* Platform Connection Status Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl border border-surface-200 bg-surface-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                providers.ga4?.connected ? 'bg-emerald-500' : 'bg-surface-300'
              }`}
            />
            <span className="text-xs font-semibold text-surface-800">Google Analytics 4</span>
          </div>
          <span
            className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${
              providers.ga4?.connected
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-surface-200 text-surface-600'
            }`}
          >
            {providers.ga4?.connected ? 'Connected' : 'Not Connected'}
          </span>
        </div>

        <div className="p-3 rounded-xl border border-surface-200 bg-surface-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                providers.gsc?.connected ? 'bg-emerald-500' : 'bg-surface-300'
              }`}
            />
            <span className="text-xs font-semibold text-surface-800">Google Search Console</span>
          </div>
          <span
            className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${
              providers.gsc?.connected
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-surface-200 text-surface-600'
            }`}
          >
            {providers.gsc?.connected ? 'Connected' : 'Not Connected'}
          </span>
        </div>

        <div className="p-3 rounded-xl border border-surface-200 bg-surface-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                providers.clarity?.connected ? 'bg-emerald-500' : 'bg-surface-300'
              }`}
            />
            <span className="text-xs font-semibold text-surface-800">Microsoft Clarity</span>
          </div>
          <span
            className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${
              providers.clarity?.connected
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-surface-200 text-surface-600'
            }`}
          >
            {providers.clarity?.connected ? 'Connected' : 'Not Connected'}
          </span>
        </div>
      </div>

      {/* Cross-Platform KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* GA4 Sessions */}
        <MetricKpiCard
          title="Total Sessions (GA4)"
          value={ga4?.totalSessions}
          previousValue={ga4?.comparison?.totalSessions}
          changePercentage={ga4?.comparison?.deltas?.sessions?.percentage}
          icon={Activity}
          iconColor="blue"
          compareEnabled={compareEnabled}
          tooltip="Total recorded website visits in Google Analytics 4."
        />

        {/* GA4 Organic Sessions */}
        <MetricKpiCard
          title="Organic Sessions (GA4)"
          value={ga4?.organicSessions}
          previousValue={ga4?.comparison?.organicSessions}
          changePercentage={ga4?.comparison?.deltas?.organicSessions?.percentage}
          icon={Globe}
          iconColor="emerald"
          compareEnabled={compareEnabled}
          tooltip="Visits originating directly from organic search engines."
        />

        {/* GSC Clicks */}
        <MetricKpiCard
          title="Search Clicks (GSC)"
          value={gsc?.totalClicks}
          previousValue={gsc?.comparison?.totalClicks}
          changePercentage={gsc?.comparison?.deltas?.clicks?.percentage}
          icon={MousePointerClick}
          iconColor="purple"
          compareEnabled={compareEnabled}
          tooltip="Total clicks on organic Google Search result links."
        />

        {/* GSC Impressions */}
        <MetricKpiCard
          title="Search Impressions (GSC)"
          value={gsc?.totalImpressions}
          previousValue={gsc?.comparison?.totalImpressions}
          changePercentage={gsc?.comparison?.deltas?.impressions?.percentage}
          icon={Eye}
          iconColor="amber"
          compareEnabled={compareEnabled}
          tooltip="Times your website was shown in Google Search results."
        />

        {/* GSC CTR */}
        <MetricKpiCard
          title="Average CTR (GSC)"
          value={gsc?.averageCtr}
          previousValue={gsc?.comparison?.averageCtr}
          changePercentage={gsc?.comparison?.deltas?.ctr?.percentage}
          format="percent"
          icon={TrendingUp}
          iconColor="emerald"
          compareEnabled={compareEnabled}
          tooltip="Click-through rate = (Total Clicks / Total Impressions) * 100."
        />

        {/* GSC Average Position */}
        <MetricKpiCard
          title="Weighted Avg Position"
          value={gsc?.averagePosition}
          previousValue={gsc?.comparison?.averagePosition}
          changePercentage={gsc?.comparison?.deltas?.position?.percentage}
          format="rank"
          isInverse={true}
          icon={Award}
          iconColor="blue"
          compareEnabled={compareEnabled}
          tooltip="Impression-weighted ranking position in Google Search. Lower is better."
        />

        {/* Clarity Dead Clicks */}
        <MetricKpiCard
          title="Dead Clicks (Clarity)"
          value={clarity?.deadClicks}
          isInverse={true}
          icon={AlertTriangle}
          iconColor="rose"
          compareEnabled={false}
          subtitle="Recent behavioral snapshot"
          tooltip="Clicks on non-interactive page elements causing user confusion."
        />

        {/* Clarity Rage Clicks */}
        <MetricKpiCard
          title="Rage Clicks (Clarity)"
          value={clarity?.rageClicks}
          isInverse={true}
          icon={Flame}
          iconColor="rose"
          compareEnabled={false}
          subtitle="Recent behavioral snapshot"
          tooltip="Rapid repeated clicks indicating user frustration or broken functionality."
        />
      </div>

      {/* Multi-Series Performance Chart */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-surface-900">
              Organic Search Traffic & Impressions Trend
            </h3>
            <p className="text-xs text-surface-500">
              Daily Google Search Console clicks and impressions alongside GA4 organic sessions.
            </p>
          </div>
        </div>

        <TrendLineChart
          data={timeSeries}
          height={300}
          series={[
            { key: 'clicks', name: 'GSC Clicks', stroke: '#2563eb', strokeWidth: 2.5 },
            { key: 'organicSessions', name: 'GA4 Organic Sessions', stroke: '#10b981', strokeWidth: 2 },
            { key: 'prev_clicks', name: 'GSC Clicks (Prev)', stroke: '#93c5fd', strokeDasharray: '4 4' },
          ]}
        />
      </div>
    </div>
  );
}
