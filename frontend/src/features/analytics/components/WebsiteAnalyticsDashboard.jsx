// frontend/src/features/analytics/components/WebsiteAnalyticsDashboard.jsx
import React, { useState } from 'react';
import { Globe, Database, Search, MousePointer, FileText } from 'lucide-react';
import DateRangeSelector, { getInitialDateRange } from './DateRangeSelector.jsx';
import ReportSummaryView from './ReportSummaryView.jsx';
import CrossPlatformOverviewView from './CrossPlatformOverviewView.jsx';
import GA4DashboardView from './GA4DashboardView.jsx';
import GSCDashboardView from './GSCDashboardView.jsx';
import ClarityDashboardView from './ClarityDashboardView.jsx';
import { useGetWebsiteAnalyticsOverviewQuery } from '../analyticsApi.js';

const TABS = [
  { id: 'report', label: 'Report Summary', Icon: FileText },
  { id: 'overview', label: 'Cross-Platform Overview', Icon: Database },
  { id: 'ga4', label: 'Google Analytics 4', Icon: Globe },
  { id: 'gsc', label: 'Google Search Console', Icon: Search },
  { id: 'clarity', label: 'Microsoft Clarity', Icon: MousePointer },
];

export default function WebsiteAnalyticsDashboard({ workspaceId, websiteId }) {
  const [activeTab, setActiveTab] = useState('report');

  // Every tab shares one period; the last choice is remembered across visits
  const [dateRange, setDateRange] = useState(() => getInitialDateRange());

  const { data: overviewData, isLoading: isLoadingOverview } = useGetWebsiteAnalyticsOverviewQuery(
    {
      workspaceId,
      websiteId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      compare: dateRange.compare,
    },
    { skip: !workspaceId || !websiteId || !dateRange.startDate || activeTab !== 'overview' }
  );

  return (
    <div className="space-y-6">
      <DateRangeSelector value={dateRange} onChange={setDateRange} showCompare={activeTab !== 'clarity'} />

      <div className="border-b border-surface-200 flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-none whitespace-nowrap pb-px">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors flex-shrink-0 ${
              activeTab === id
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'report' && (
        <ReportSummaryView workspaceId={workspaceId} websiteId={websiteId} dateRange={dateRange} />
      )}

      {activeTab === 'overview' && (
        <CrossPlatformOverviewView
          data={overviewData?.data}
          isLoading={isLoadingOverview}
          compareEnabled={dateRange.compare}
        />
      )}

      {activeTab === 'ga4' && (
        <GA4DashboardView workspaceId={workspaceId} websiteId={websiteId} dateRange={dateRange} />
      )}

      {activeTab === 'gsc' && (
        <GSCDashboardView workspaceId={workspaceId} websiteId={websiteId} dateRange={dateRange} />
      )}

      {activeTab === 'clarity' && (
        <ClarityDashboardView workspaceId={workspaceId} websiteId={websiteId} dateRange={dateRange} />
      )}
    </div>
  );
}
