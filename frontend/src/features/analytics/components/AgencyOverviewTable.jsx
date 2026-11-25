// frontend/src/features/analytics/components/AgencyOverviewTable.jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Globe,
  Building2,
  ExternalLink,
  Search,
  MousePointerClick,
  Eye,
  Activity,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { useGetAgencyOverviewQuery } from '../analyticsApi.js';
import DateRangeSelector, { getInitialDateRange } from './DateRangeSelector.jsx';

/** Small +x% / -x% badge; nothing when there is no comparison value. */
function ChangeBadge({ value }) {
  if (value === null || value === undefined || isNaN(value)) return null;
  const up = value > 0;
  const flat = value === 0;
  return (
    <span
      className={`ml-1.5 text-2xs font-semibold ${
        flat ? 'text-surface-400' : up ? 'text-emerald-600' : 'text-rose-600'
      }`}
    >
      {up ? '+' : ''}
      {Number(value).toFixed(1)}%
    </span>
  );
}

const pctChange = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0);

export default function AgencyOverviewTable({ workspaceId, filterClientId }) {
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState(() => getInitialDateRange());

  const { data: agencyData, isLoading, isFetching } = useGetAgencyOverviewQuery(
    { workspaceId, startDate: dateRange.startDate, endDate: dateRange.endDate },
    { skip: !workspaceId || !dateRange.startDate }
  );
  const showChange = dateRange.compare;

  const websites = agencyData?.data?.websites || [];

  // Filter by clientId if provided (e.g. inside ClientDetailPage)
  let filtered = websites;
  if (filterClientId) {
    filtered = filtered.filter((w) => w.clientId === filterClientId);
  }

  // Filter by search query
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (w) =>
        w.domain.toLowerCase().includes(q) ||
        w.websiteName?.toLowerCase().includes(q) ||
        w.clientName.toLowerCase().includes(q)
    );
  }

  // Agency rollup aggregates
  const totalClicks = filtered.reduce((acc, w) => acc + (w.metrics?.gscClicks || 0), 0);
  const totalImpressions = filtered.reduce((acc, w) => acc + (w.metrics?.gscImpressions || 0), 0);
  const totalSessions = filtered.reduce((acc, w) => acc + (w.metrics?.ga4Sessions || 0), 0);
  const totalOrganic = filtered.reduce((acc, w) => acc + (w.metrics?.ga4OrganicSessions || 0), 0);
  const prevTotal = (key) => filtered.reduce((acc, w) => acc + (w.previous?.[key] || 0), 0);
  const totalChanges = {
    clicks: pctChange(totalClicks, prevTotal('clicks')),
    impressions: pctChange(totalImpressions, prevTotal('impressions')),
    sessions: pctChange(totalSessions, prevTotal('sessions')),
    organicSessions: pctChange(totalOrganic, prevTotal('organicSessions')),
  };

  return (
    <div className={`space-y-4 ${isFetching ? 'opacity-70 transition-opacity' : ''}`}>
      <DateRangeSelector value={dateRange} onChange={setDateRange} />

      {/* Agency Aggregates Scorecards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-2xs font-semibold text-surface-400 uppercase tracking-wider">
            Total Search Clicks
          </div>
          <div className="text-2xl font-bold text-surface-900 mt-1 flex items-center justify-between">
            <span>{isLoading ? '…' : totalClicks.toLocaleString()}{showChange && <ChangeBadge value={totalChanges.clicks} />}</span>
            <MousePointerClick className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-2xs text-surface-500 mt-1">Across all filtered websites</div>
        </div>

        <div className="card p-4">
          <div className="text-2xs font-semibold text-surface-400 uppercase tracking-wider">
            Total Impressions
          </div>
          <div className="text-2xl font-bold text-surface-900 mt-1 flex items-center justify-between">
            <span>{isLoading ? '…' : totalImpressions.toLocaleString()}{showChange && <ChangeBadge value={totalChanges.impressions} />}</span>
            <Eye className="w-5 h-5 text-purple-500" />
          </div>
          <div className="text-2xs text-surface-500 mt-1">Search visibility reach</div>
        </div>

        <div className="card p-4">
          <div className="text-2xs font-semibold text-surface-400 uppercase tracking-wider">
            Total Sessions
          </div>
          <div className="text-2xl font-bold text-surface-900 mt-1 flex items-center justify-between">
            <span>{isLoading ? '…' : totalSessions.toLocaleString()}{showChange && <ChangeBadge value={totalChanges.sessions} />}</span>
            <Activity className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-2xs text-surface-500 mt-1">Google Analytics 4 traffic</div>
        </div>

        <div className="card p-4">
          <div className="text-2xs font-semibold text-surface-400 uppercase tracking-wider">
            Organic Traffic
          </div>
          <div className="text-2xl font-bold text-surface-900 mt-1 flex items-center justify-between">
            <span>{isLoading ? '…' : totalOrganic.toLocaleString()}{showChange && <ChangeBadge value={totalChanges.organicSessions} />}</span>
            <Globe className="w-5 h-5 text-brand-500" />
          </div>
          <div className="text-2xs text-surface-500 mt-1">Visits from search engines</div>
        </div>
      </div>

      {/* Main Table */}
      <div className="card overflow-hidden">
        {/* Table Top Controls */}
        <div className="p-4 border-b border-surface-200 bg-surface-50/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-surface-900">
              {filterClientId ? 'Client Websites SEO Performance' : 'Portfolio Websites SEO Performance'}
            </h3>
            <span className="text-2xs bg-surface-200 text-surface-700 px-2 py-0.5 rounded-full font-medium">
              {filtered.length} sites
            </span>
          </div>

          <div className="relative min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by domain or client..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-surface-200 rounded-lg text-surface-800 placeholder-surface-400 focus:outline-hidden focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-surface-600">
            <thead className="bg-surface-50 text-surface-500 border-b border-surface-200 uppercase text-2xs font-semibold tracking-wider">
              <tr>
                <th className="px-4 py-3">Website & Client</th>
                <th className="px-4 py-3 text-right">GSC Clicks</th>
                <th className="px-4 py-3 text-right">GSC Impressions</th>
                <th className="px-4 py-3 text-right">Avg CTR</th>
                <th className="px-4 py-3 text-right">GA4 Sessions</th>
                <th className="px-4 py-3 text-right">GA4 Organic</th>
                <th className="px-4 py-3 text-center">Clarity Friction</th>
                <th className="px-4 py-3 text-center">Integrations</th>
                <th className="px-4 py-3 text-right">Dashboard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-surface-400">
                    Loading portfolio websites…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-surface-400">
                    No websites match your filter criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((w) => {
                  const m = w.metrics || {};
                  return (
                    <tr key={w.websiteId} className="hover:bg-surface-50/80 transition-colors">
                      {/* Website & Client */}
                      <td className="px-4 py-3">
                        <Link
                          to={`/websites/${w.websiteId}`}
                          className="font-semibold text-surface-900 hover:text-brand-600 flex items-center gap-1.5"
                        >
                          <Globe className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                          <span>{w.domain}</span>
                        </Link>
                        <div className="text-2xs text-surface-400 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3" />
                          <span>{w.clientName}</span>
                        </div>
                      </td>

                      {/* GSC Clicks */}
                      <td className="px-4 py-3 text-right font-semibold text-surface-900">
                        {m.gscClicks ? m.gscClicks.toLocaleString() : '—'}{showChange && <ChangeBadge value={w.changes?.clicks} />}
                      </td>

                      {/* GSC Impressions */}
                      <td className="px-4 py-3 text-right">
                        {m.gscImpressions ? m.gscImpressions.toLocaleString() : '—'}
                      </td>

                      {/* Avg CTR */}
                      <td className="px-4 py-3 text-right">
                        {m.gscCtr !== undefined ? `${Number(m.gscCtr).toFixed(1)}%` : '—'}
                      </td>

                      {/* GA4 Sessions */}
                      <td className="px-4 py-3 text-right font-semibold text-surface-900">
                        {m.ga4Sessions ? m.ga4Sessions.toLocaleString() : '—'}{showChange && <ChangeBadge value={w.changes?.sessions} />}
                      </td>

                      {/* GA4 Organic */}
                      <td className="px-4 py-3 text-right text-emerald-700 font-medium">
                        {m.ga4OrganicSessions ? m.ga4OrganicSessions.toLocaleString() : '—'}
                      </td>

                      {/* Clarity Friction */}
                      <td className="px-4 py-3 text-center">
                        {m.clarityFrustratedSessions ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-2xs font-semibold border border-rose-200">
                            {m.clarityFrustratedSessions.toLocaleString()} friction
                          </span>
                        ) : (
                          <span className="text-2xs text-surface-400">None</span>
                        )}
                      </td>

                      {/* Integrations Badges */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span
                            title={`GA4: ${w.integrations?.ga4 ? 'Connected' : 'Not Connected'}`}
                            className={`w-2 h-2 rounded-full ${
                              w.integrations?.ga4 ? 'bg-emerald-500' : 'bg-surface-300'
                            }`}
                          />
                          <span
                            title={`GSC: ${w.integrations?.gsc ? 'Connected' : 'Not Connected'}`}
                            className={`w-2 h-2 rounded-full ${
                              w.integrations?.gsc ? 'bg-emerald-500' : 'bg-surface-300'
                            }`}
                          />
                          <span
                            title={`Clarity: ${w.integrations?.clarity ? 'Connected' : 'Not Connected'}`}
                            className={`w-2 h-2 rounded-full ${
                              w.integrations?.clarity ? 'bg-emerald-500' : 'bg-surface-300'
                            }`}
                          />
                        </div>
                      </td>

                      {/* Dashboard Link */}
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/websites/${w.websiteId}`}
                          className="btn-secondary btn-sm text-2xs inline-flex items-center gap-1 py-1 px-2"
                        >
                          <span>Open</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
