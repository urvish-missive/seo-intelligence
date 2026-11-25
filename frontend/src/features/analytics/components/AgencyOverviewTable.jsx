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
  RefreshCw,
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
  const countryTotals = new Map();
  filtered.forEach((website) => {
    (website.countryBreakdown || []).forEach(({ country, sessions }) => {
      countryTotals.set(country, (countryTotals.get(country) || 0) + sessions);
    });
  });
  const topCountries = Array.from(countryTotals, ([country, sessions]) => ({ country, sessions }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);
  const maxCountrySessions = topCountries[0]?.sessions || 1;

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

      <section className="card p-5">
        <div className="flex items-start gap-3 mb-4">
          <Globe className="w-5 h-5 text-brand-600 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-surface-900">Top countries by GA4 sessions</h3>
            <p className="text-xs text-surface-500 mt-0.5">Countries with the most visits across the selected websites and date range.</p>
          </div>
        </div>
        {isLoading ? (
          <p className="text-xs text-surface-400 py-3">Loading country data...</p>
        ) : topCountries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            {topCountries.map((item, index) => (
              <div key={item.country} className="flex items-center gap-3">
                <span className="w-5 text-right text-2xs text-surface-400">{index + 1}</span>
                <span className="w-32 truncate text-xs font-medium text-surface-700" title={item.country}>{item.country}</span>
                <div className="flex-1 h-2 rounded-full bg-surface-100 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(3, (item.sessions / maxCountrySessions) * 100)}%` }} />
                </div>
                <span className="w-20 text-right text-xs font-semibold text-surface-800">{item.sessions.toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-surface-500 rounded-lg bg-surface-50 p-3">
            No GA4 country data is available for this range yet. Run <strong>Import Data</strong> for the websites to load their country breakdown.
          </p>
        )}
      </section>

      {/* Main Table */}
      <div className="card overflow-hidden">
        {/* Table Top Controls */}
        <div className="px-6 py-5 border-b border-surface-200 bg-gradient-to-r from-brand-50/80 via-white to-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-1 h-10 w-1 rounded-full bg-brand-600" />
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-xl sm:text-2xl font-bold text-surface-950 tracking-tight leading-tight">
                  {filterClientId ? 'Client Websites SEO Performance' : 'Portfolio Websites SEO Performance'}
                </h3>
                <span className="text-xs bg-white text-surface-700 px-2.5 py-1 rounded-full font-semibold border border-surface-200 shadow-sm">
                  {filtered.length} {filtered.length === 1 ? 'website' : 'websites'}
                </span>
              </div>
              <p className="mt-1 text-sm text-surface-500">Compare search and traffic results across your websites</p>
            </div>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by domain or client..."
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-surface-200 rounded-xl text-surface-800 placeholder-surface-400 focus:outline-hidden focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm text-surface-600">
            <thead className="bg-surface-50 text-surface-600 border-b border-surface-200 uppercase text-xs font-bold tracking-wide">
              <tr>
                <th className="px-5 py-4 min-w-[230px]">Website & Client</th>
                <th className="px-5 py-4 text-right min-w-[125px]">GSC Clicks</th>
                <th className="px-5 py-4 text-right min-w-[150px]">GSC Impressions</th>
                <th className="px-5 py-4 text-right min-w-[105px]">Avg CTR</th>
                <th className="px-5 py-4 text-right min-w-[135px]">GA4 Sessions</th>
                <th className="px-5 py-4 text-right min-w-[135px]">GA4 Organic</th>
                <th className="px-5 py-4 text-center min-w-[150px]">Clarity Friction</th>
                <th className="px-5 py-4 text-center min-w-[110px]">Integrations</th>
                <th className="px-5 py-4 text-right min-w-[220px]">Actions</th>
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
                    <tr key={w.websiteId} className="hover:bg-brand-50/40 transition-colors even:bg-surface-50/30">
                      {/* Website & Client */}
                      <td className="px-5 py-4">
                        <Link
                          to={`/websites/${w.websiteId}`}
                          className="text-sm font-bold text-surface-900 hover:text-brand-600 flex items-center gap-2"
                        >
                          <Globe className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                          <span>{w.domain}</span>
                        </Link>
                        <div className="text-xs text-surface-500 flex items-center gap-1.5 mt-1">
                          <Building2 className="w-3 h-3" />
                          <span>{w.clientName}</span>
                        </div>
                      </td>

                      {/* GSC Clicks */}
                      <td className="px-5 py-4 text-right text-sm font-bold text-surface-900 tabular-nums">
                        {m.gscClicks ? m.gscClicks.toLocaleString() : '—'}{showChange && <ChangeBadge value={w.changes?.clicks} />}
                      </td>

                      {/* GSC Impressions */}
                      <td className="px-5 py-4 text-right text-sm font-semibold text-surface-800 tabular-nums">
                        {m.gscImpressions ? m.gscImpressions.toLocaleString() : '—'}
                      </td>

                      {/* Avg CTR */}
                      <td className="px-5 py-4 text-right text-sm font-semibold text-surface-800 tabular-nums">
                        {m.gscCtr !== undefined ? `${Number(m.gscCtr).toFixed(1)}%` : '—'}
                      </td>

                      {/* GA4 Sessions */}
                      <td className="px-5 py-4 text-right text-sm font-bold text-surface-900 tabular-nums">
                        {m.ga4Sessions ? m.ga4Sessions.toLocaleString() : '—'}{showChange && <ChangeBadge value={w.changes?.sessions} />}
                      </td>

                      {/* GA4 Organic */}
                      <td className="px-5 py-4 text-right text-sm font-semibold text-emerald-700 tabular-nums">
                        {m.ga4OrganicSessions ? m.ga4OrganicSessions.toLocaleString() : '—'}
                      </td>

                      {/* Clarity Friction */}
                      <td className="px-5 py-4 text-center">
                        {m.clarityFrustratedSessions ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-2xs font-semibold border border-rose-200">
                            {m.clarityFrustratedSessions.toLocaleString()} friction
                          </span>
                        ) : (
                          <span className="text-2xs text-surface-400">None</span>
                        )}
                      </td>

                      {/* Integrations Badges */}
                      <td className="px-5 py-4 text-center">
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

                      {/* Sync shortcuts and dashboard link */}
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {w.integrations?.ga4 && <Link to={`/websites/${w.websiteId}?sync=GA4`} className="btn-secondary btn-sm text-2xs inline-flex items-center gap-1 py-1 px-2" title="Import GA4 data"><RefreshCw className="w-3 h-3" /><span>GA4</span></Link>}
                          {w.integrations?.gsc && <Link to={`/websites/${w.websiteId}?sync=GSC`} className="btn-secondary btn-sm text-2xs inline-flex items-center gap-1 py-1 px-2" title="Import Search Console data"><RefreshCw className="w-3 h-3" /><span>GSC</span></Link>}
                          {w.integrations?.clarity && <Link to={`/websites/${w.websiteId}?sync=CLARITY`} className="btn-secondary btn-sm text-2xs inline-flex items-center gap-1 py-1 px-2" title="Import Clarity data"><RefreshCw className="w-3 h-3" /><span>Clarity</span></Link>}
                          <Link to={`/websites/${w.websiteId}`} className="btn-secondary btn-sm text-2xs inline-flex items-center gap-1 py-1 px-2"><span>Open</span><ArrowRight className="w-3 h-3" /></Link>
                        </div>
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
