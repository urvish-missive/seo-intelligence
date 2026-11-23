// frontend/src/features/analytics/components/WebsiteAnalyticsDashboard.jsx
import React, { useState } from 'react';
import {
  Globe,
  Database,
  Search,
  MousePointer,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import DateRangeSelector from './DateRangeSelector.jsx';
import CrossPlatformOverviewView from './CrossPlatformOverviewView.jsx';
import GA4DashboardView from './GA4DashboardView.jsx';
import GSCDashboardView from './GSCDashboardView.jsx';
import ClarityDashboardView from './ClarityDashboardView.jsx';
import { useGetWebsiteAnalyticsOverviewQuery } from '../analyticsApi.js';

export default function WebsiteAnalyticsDashboard({
  workspaceId,
  websiteId,
  website,
}) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'ga4' | 'gsc' | 'clarity'

  const [dateRange, setDateRange] = useState({
    preset: 'last_28_days',
    startDate: '',
    endDate: '',
    compare: true,
  });

  const { data: overviewData, isLoading: isLoadingOverview, refetch } =
    useGetWebsiteAnalyticsOverviewQuery(
      {
        workspaceId,
        websiteId,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        compare: dateRange.compare,
      },
      { skip: !workspaceId || !websiteId || !dateRange.startDate }
    );

  return (
    <div className="space-y-6">
      {/* Top Global Date Filter (Preserved across all 3 Google tabs) */}
      <DateRangeSelector
        value={dateRange}
        onChange={setDateRange}
        showCompare={activeTab !== 'clarity'}
      />

      {/* Sub Navigation Tabs */}
      <div className="border-b border-surface-200 flex flex-wrap items-center gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-surface-500 hover:text-surface-800'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Cross-Platform Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ga4')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'ga4'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-surface-500 hover:text-surface-800'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Google Analytics 4</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('gsc')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'gsc'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-surface-500 hover:text-surface-800'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>Google Search Console</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('clarity')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'clarity'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-surface-500 hover:text-surface-800'
          }`}
        >
          <MousePointer className="w-4 h-4" />
          <span>Microsoft Clarity</span>
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'overview' && (
        <CrossPlatformOverviewView
          data={overviewData?.data}
          isLoading={isLoadingOverview}
          compareEnabled={dateRange.compare}
        />
      )}

      {activeTab === 'ga4' && (
        <GA4DashboardView
          workspaceId={workspaceId}
          websiteId={websiteId}
          dateRange={dateRange}
        />
      )}

      {activeTab === 'gsc' && (
        <GSCDashboardView
          workspaceId={workspaceId}
          websiteId={websiteId}
          dateRange={dateRange}
        />
      )}

      {activeTab === 'clarity' && (
        <ClarityDashboardView
          workspaceId={workspaceId}
          websiteId={websiteId}
        />
      )}
    </div>
  );
}
