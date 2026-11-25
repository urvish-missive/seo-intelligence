// frontend/src/features/analytics/components/ReportSummaryView.jsx
// On-screen version of the downloadable SEO report for the selected period:
// executive summary, KPIs vs previous period, trend, traffic health,
// keyword opportunities, top queries/pages/sources, Clarity UX and SEO findings.
import React from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  MousePointer,
  MousePointerClick,
  Eye,
  TrendingUp,
  Award,
  Target,
  Flame,
  AlertTriangle,
  FileText,
  ShieldAlert,
  CheckCircle2,
  Activity,
  Download,
} from 'lucide-react';
import MetricKpiCard from './MetricKpiCard.jsx';
import TrendLineChart from './TrendLineChart.jsx';
import { useGetReportSummaryQuery } from '../analyticsApi.js';

const fmtNum = (v) => (v === null || v === undefined || isNaN(v) ? '—' : Number(v).toLocaleString());
const fmtPct = (v) => (v === null || v === undefined || isNaN(v) ? '—' : `${Number(v).toFixed(2)}%`);
const fmtPos = (v) => (v === null || v === undefined || isNaN(v) || Number(v) === 0 ? '—' : Number(v).toFixed(1));

function Section({ title, icon: Icon, children, right }) {
  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h3 className="text-sm font-semibold text-surface-900 flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-brand-600" />}
          {title}
        </h3>
        {right}
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}

function SimpleTable({ columns, rows, empty }) {
  if (!rows || rows.length === 0) {
    return <div className="text-xs text-surface-400 py-6 text-center">{empty}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-surface-500 border-b border-surface-200">
            {columns.map((c) => (
              <th key={c.key} className={`py-2 pr-3 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-surface-50">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`py-2 pr-3 ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.className || ''}`}
                >
                  {c.render ? c.render(r[c.key], r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SEVERITY_STYLES = {
  CRITICAL: 'bg-rose-50 text-rose-700 border-rose-200',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW: 'bg-surface-100 text-surface-600 border-surface-200',
};

const TRAFFIC_STATUS = {
  CRITICAL_DROP: { label: 'Critical traffic drop', cls: 'border-rose-200 bg-rose-50 text-rose-800', Icon: ShieldAlert },
  MODERATE_DECLINE: { label: 'Moderate decline', cls: 'border-amber-200 bg-amber-50 text-amber-800', Icon: AlertTriangle },
  STABLE_OR_GROWING: { label: 'Stable or growing', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CheckCircle2 },
};

export default function ReportSummaryView({ workspaceId, websiteId, dateRange }) {
  const { data: res, isLoading, isFetching, isError, error } = useGetReportSummaryQuery(
    { workspaceId, websiteId, startDate: dateRange.startDate, endDate: dateRange.endDate },
    { skip: !workspaceId || !websiteId || !dateRange.startDate }
  );

  if (isLoading) {
    return <div className="card p-12 text-center text-sm text-surface-400">Building report summary…</div>;
  }
  if (isError) {
    return (
      <div className="card p-8 text-center text-sm text-rose-600">
        Could not load the report summary: {error?.data?.message || error?.error || 'unknown error'}
      </div>
    );
  }

  const d = res?.data || {};
  const m = d.metrics || {};
  const ga4 = m.ga4 || {};
  const gsc = m.gsc || {};
  const clarity = m.clarity || {};
  const freshness = d.dataFreshness || {};
  const compare = dateRange.compare;
  const drop = m.trafficDrop;
  const status = TRAFFIC_STATUS[drop?.status];
  const findings = m.seoFindings || [];

  // Merge GA4 + GSC daily trends by date
  const trendMap = new Map();
  (ga4.trends || []).forEach((t) => trendMap.set(t.date, { date: t.date, sessions: t.sessions, organicSessions: t.organicSessions }));
  (gsc.trends || []).forEach((t) => {
    const e = trendMap.get(t.date) || { date: t.date };
    e.clicks = t.clicks;
    e.impressions = t.impressions;
    trendMap.set(t.date, e);
  });
  const trend = Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const cs = clarity.summary?.friction;

  return (
    <div className={`space-y-6 ${isFetching ? 'opacity-70 transition-opacity' : ''}`}>
      {/* Header: period + data sources */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-surface-500">
          Report period <span className="font-semibold text-surface-800">{d.metadata?.periodStart} → {d.metadata?.periodEnd}</span>
          {compare && d.metadata?.comparisonStart && (
            <>
              {' '}vs <span className="font-medium text-surface-700">{d.metadata.comparisonStart} → {d.metadata.comparisonEnd}</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {['GA4', 'GSC', 'CLARITY'].map((p) => {
            const f = freshness[p];
            return (
              <span
                key={p}
                title={f?.lastSyncAt ? `Last sync ${new Date(f.lastSyncAt).toLocaleString()}` : f?.message}
                className={`text-2xs font-semibold px-2 py-0.5 rounded-full border ${
                  f?.connected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-surface-100 text-surface-500 border-surface-200'
                }`}
              >
                {p === 'CLARITY' ? 'Clarity' : p} {f?.connected ? '●' : '○'}
              </span>
            );
          })}
          <Link to="/reports" className="btn-secondary btn-sm text-xs inline-flex items-center gap-1">
            <Download className="w-3.5 h-3.5" /> PDF / Excel
          </Link>
        </div>
      </div>

      {/* Executive summary */}
      {d.executiveSummary?.text && (
        <Section title="Executive Summary" icon={FileText}>
          <div className="text-sm text-surface-700 leading-relaxed space-y-3">
            {d.executiveSummary.text.split('\n\n').map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </Section>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricKpiCard title="Sessions" value={ga4.summary?.sessions} previousValue={ga4.comparison?.previousSessions} changePercentage={ga4.comparison?.sessionsChangePercent} icon={MousePointer} iconColor="blue" compareEnabled={compare} />
        <MetricKpiCard title="Users" value={ga4.summary?.totalUsers} previousValue={ga4.comparison?.previousUsers} changePercentage={ga4.comparison?.usersChangePercent} icon={Users} iconColor="purple" compareEnabled={compare} />
        <MetricKpiCard title="Organic Sessions" value={ga4.summary?.organicSessions} changePercentage={ga4.comparison?.organicSessionsChangePercent} icon={TrendingUp} iconColor="emerald" compareEnabled={compare} />
        <MetricKpiCard title="Conversions" value={ga4.summary?.conversions} changePercentage={ga4.comparison?.conversionsChangePercent} icon={Target} iconColor="amber" compareEnabled={compare} />
        <MetricKpiCard title="Search Clicks" value={gsc.summary?.clicks} previousValue={gsc.comparison?.previousClicks} changePercentage={gsc.comparison?.clicksChangePercent} icon={MousePointerClick} iconColor="blue" compareEnabled={compare} />
        <MetricKpiCard title="Impressions" value={gsc.summary?.impressions} previousValue={gsc.comparison?.previousImpressions} changePercentage={gsc.comparison?.impressionsChangePercent} icon={Eye} iconColor="purple" compareEnabled={compare} />
        <MetricKpiCard title="CTR" value={gsc.summary?.ctr} format="percent" changePercentage={gsc.comparison?.ctrChangePercent} icon={TrendingUp} iconColor="emerald" compareEnabled={compare} />
        <MetricKpiCard title="Avg Position" value={gsc.summary?.averagePosition} format="rank" isInverse icon={Award} iconColor="blue" compareEnabled={false} subtitle={gsc.comparison?.positionChange ? `${gsc.comparison.positionChange > 0 ? '+' : ''}${gsc.comparison.positionChange.toFixed(1)} vs previous (lower is better)` : undefined} />
      </div>

      {/* Trend + traffic health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5 space-y-3 lg:col-span-2">
          <h3 className="text-sm font-semibold text-surface-900">Daily Sessions & Search Clicks</h3>
          <TrendLineChart
            data={trend}
            height={260}
            series={[
              { key: 'sessions', name: 'Sessions (GA4)', stroke: '#2563eb', strokeWidth: 2.5 },
              { key: 'organicSessions', name: 'Organic sessions (GA4)', stroke: '#10b981', strokeWidth: 2 },
              { key: 'clicks', name: 'Search clicks (GSC)', stroke: '#8b5cf6', strokeWidth: 2 },
            ]}
          />
        </div>
        <div className="space-y-4">
          {status && (
            <div className={`p-4 rounded-xl border ${status.cls}`}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <status.Icon className="w-4 h-4" />
                {status.label}
              </div>
              <div className="text-xs mt-1">
                Sessions {fmtNum(drop.currentSessions)} vs {fmtNum(drop.previousSessions)} previous
                {drop.changePercent !== null && drop.changePercent !== undefined && ` (${drop.changePercent > 0 ? '+' : ''}${Number(drop.changePercent).toFixed(1)}%)`}
              </div>
            </div>
          )}
          {clarity.available && cs && (
            <div className="card p-4 space-y-2">
              <div className="text-xs font-semibold text-surface-800 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-rose-500" /> Clarity UX friction
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-surface-500">Sessions</dt><dd className="text-right tabular-nums">{fmtNum(cs.totalSessions)}</dd>
                <dt className="text-surface-500">Rage clicks</dt><dd className="text-right tabular-nums">{fmtNum(cs.rageClickCount)}</dd>
                <dt className="text-surface-500">Dead clicks</dt><dd className="text-right tabular-nums">{fmtNum(cs.deadClickCount)}</dd>
                <dt className="text-surface-500">Quick backs</dt><dd className="text-right tabular-nums">{fmtNum(cs.quickbackClickCount)}</dd>
                <dt className="text-surface-500">Scroll depth</dt><dd className="text-right tabular-nums">{fmtPct(cs.avgScrollDepth)}</dd>
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* Keyword opportunities */}
      <Section title="Keyword Opportunities (positions 4–20)" icon={Target}>
        <SimpleTable
          rows={gsc.opportunities}
          empty={gsc.available ? 'No striking-distance keywords in this period.' : 'Connect Google Search Console to see keyword opportunities.'}
          columns={[
            { key: 'query', label: 'Query', className: 'font-medium text-surface-800' },
            { key: 'position', label: 'Position', align: 'right', render: fmtPos },
            { key: 'impressions', label: 'Impressions', align: 'right', render: fmtNum },
            { key: 'clicks', label: 'Clicks', align: 'right', render: fmtNum },
            { key: 'ctr', label: 'CTR', align: 'right', render: fmtPct },
            { key: 'recommendation', label: 'Next step', className: 'text-surface-500 max-w-xs' },
          ]}
        />
      </Section>

      {/* Top queries + pages */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Top Search Queries" icon={MousePointerClick}>
          <SimpleTable
            rows={(gsc.queries || []).slice(0, 15)}
            empty="No search query data for this period."
            columns={[
              { key: 'query', label: 'Query', className: 'font-medium text-surface-800' },
              { key: 'clicks', label: 'Clicks', align: 'right', render: fmtNum },
              { key: 'impressions', label: 'Impr.', align: 'right', render: fmtNum },
              { key: 'ctr', label: 'CTR', align: 'right', render: fmtPct },
              { key: 'position', label: 'Pos.', align: 'right', render: fmtPos },
            ]}
          />
        </Section>
        <Section title="Top Search Pages" icon={FileText}>
          <SimpleTable
            rows={(gsc.pages || []).slice(0, 15)}
            empty="No search page data for this period."
            columns={[
              { key: 'page', label: 'Page', render: (v) => <span className="font-mono text-brand-700 truncate block max-w-[18rem]" title={v}>{v}</span> },
              { key: 'clicks', label: 'Clicks', align: 'right', render: fmtNum },
              { key: 'impressions', label: 'Impr.', align: 'right', render: fmtNum },
              { key: 'position', label: 'Pos.', align: 'right', render: fmtPos },
            ]}
          />
        </Section>
      </div>

      {/* GA4 landing pages + sources */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Top Landing Pages" icon={Activity}>
          <SimpleTable
            rows={(ga4.landingPages || []).slice(0, 15)}
            empty={ga4.available ? 'No landing page data for this period.' : 'Connect GA4 to see landing pages.'}
            columns={[
              { key: 'landingPage', label: 'Page', render: (v) => <span className="font-mono text-brand-700 truncate block max-w-[18rem]" title={v}>{v}</span> },
              { key: 'sessions', label: 'Sessions', align: 'right', render: fmtNum },
              { key: 'engagementRate', label: 'Engaged', align: 'right', render: (v) => (v === undefined ? '—' : `${Number(v).toFixed(1)}%`) },
              { key: 'conversions', label: 'Conv.', align: 'right', render: fmtNum },
            ]}
          />
        </Section>
        <Section title="Traffic Sources" icon={TrendingUp}>
          <SimpleTable
            rows={(ga4.sources || []).slice(0, 10)}
            empty={ga4.available ? 'No traffic source data for this period.' : 'Connect GA4 to see traffic sources.'}
            columns={[
              { key: 'channel', label: 'Channel', render: (v, r) => (
                <div>
                  <div className="font-medium text-surface-800">{v || 'Direct'}</div>
                  <div className="text-2xs text-surface-400">{[r.source, r.medium].filter(Boolean).join(' / ')}</div>
                </div>
              ) },
              { key: 'sessions', label: 'Sessions', align: 'right', render: fmtNum },
              { key: 'users', label: 'Users', align: 'right', render: fmtNum },
              { key: 'conversions', label: 'Conv.', align: 'right', render: fmtNum },
            ]}
          />
        </Section>
      </div>

      {/* SEO findings */}
      <Section title={`SEO Findings (${findings.length})`} icon={ShieldAlert}>
        {findings.length === 0 ? (
          <div className="text-xs text-surface-400 py-6 text-center">No SEO findings recorded.</div>
        ) : (
          <ul className="divide-y divide-surface-100">
            {findings.map((f) => (
              <li key={f.id} className="py-3 flex items-start gap-3">
                <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${SEVERITY_STYLES[f.severity] || SEVERITY_STYLES.LOW}`}>
                  {f.severity}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-surface-900">{f.title}</div>
                  {f.affectedTarget && <div className="text-2xs font-mono text-surface-400 truncate">{f.affectedTarget}</div>}
                  {f.suggestedAction && <div className="text-xs text-surface-600 mt-1">{f.suggestedAction}</div>}
                </div>
                <span className="ml-auto text-2xs text-surface-400 shrink-0">{f.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
