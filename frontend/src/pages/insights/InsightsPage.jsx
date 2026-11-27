// frontend/src/pages/insights/InsightsPage.jsx
// Insights for one website: new vs returning visitors, form funnel, AI
// visitors, channel trends, pages that need attention and page-by-page
// performance across GA4, Search Console and Clarity.
//
// Every section loads on its own, so a slow GA4 query never blanks the page.

import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Lightbulb,
  Loader2,
  Users,
  FileInput,
  Bot,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  AlertTriangle,
  Info,
  CheckCircle2,
  ExternalLink,
  Search,
  ArrowUpDown,
  Flame,
} from 'lucide-react';
import { selectActiveWorkspace } from '../../features/auth/authSlice.js';
import { useGetWebsitesQuery } from '../../features/websites/websitesApi.js';
import { useGetInsightsQuery } from '../../features/analytics/analyticsApi.js';

const STORAGE_KEY = 'missive.insights.filters';
const PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b', '#ef4444', '#84cc16', '#a855f7', '#14b8a6'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PERIODS = [
  { id: '3m', label: 'Last 3 months', months: 3 },
  { id: '6m', label: 'Last 6 months', months: 6 },
  { id: '12m', label: 'Last 12 months', months: 12 },
  { id: '24m', label: 'Last 24 months', months: 24 },
];

const SECTIONS = [
  { id: 'visitors', label: 'New vs returning', icon: Users },
  { id: 'forms', label: 'Forms', icon: FileInput },
  { id: 'ai', label: 'AI visitors', icon: Bot },
  { id: 'channels', label: 'Channels', icon: TrendingUp },
  { id: 'attention', label: 'Pages to fix', icon: Lightbulb },
  { id: 'pages', label: 'All pages', icon: Search },
];

function pad(n) {
  return String(n).padStart(2, '0');
}
function rangeFor(periodId) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const months = PERIODS.find((p) => p.id === periodId)?.months || 12;
  const start = new Date(y.getFullYear(), y.getMonth() - (months - 1), 1);
  const f = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { startDate: f(start), endDate: f(y) };
}
const monthLabel = (ym) => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(2, 4)}`;
const num = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString());
const pct = (v, d = 1) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(d)}%`);
const dur = (s) => {
  if (s === null || s === undefined) return '—';
  const m = Math.floor(s / 60);
  return m ? `${m}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;
};

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

// ─── Shared building blocks ─────────────────────────────────────────────────

function SectionCard({ id, icon: Icon, title, subtitle, children, right }) {
  return (
    <section id={`insights-${id}`} className="card p-5 scroll-mt-20">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-surface-900 flex items-center gap-2">
            <Icon className="w-4 h-4 text-brand-600" />
            {title}
          </h2>
          {subtitle && <p className="text-xs text-surface-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Loading / error / content for one section's query. */
function QueryState({ query, children, height = 220 }) {
  if (query.isLoading || (query.isFetching && !query.data)) {
    return (
      <div className="flex items-center justify-center gap-2.5 rounded-xl bg-surface-50 text-sm text-surface-500" style={{ height }}>
        <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
        Loading data…
      </div>
    );
  }
  if (query.error) {
    const msg = query.error?.data?.error?.message || query.error?.data?.message || 'Could not load this section.';
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-700 p-6">
        <AlertTriangle className="w-4 h-4" />
        {msg}
      </div>
    );
  }
  const data = query.data?.data;
  if (!data) return null;
  return (
    <div className="relative">
      {query.isFetching && (
        <div className="absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-white/80 backdrop-blur-[2px]">
          <div className="mt-16 flex items-center gap-2.5 rounded-lg border border-surface-200 bg-white px-4 py-3 shadow-dropdown">
            <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
            <span className="text-sm font-medium text-surface-700">Loading data…</span>
          </div>
        </div>
      )}
      {children(data)}
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  const toneClass = tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-rose-600' : 'text-surface-900';
  return (
    <div className="rounded-xl border border-surface-200 p-4">
      <p className="text-2xs font-semibold uppercase tracking-wider text-surface-400">{label}</p>
      <p className={`text-xl font-semibold mt-1 tabular-nums ${toneClass}`}>{value}</p>
      {sub && <p className="text-xs text-surface-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function Note({ tone = 'info', children }) {
  const styles = {
    info: ['bg-brand-50 border-brand-100 text-surface-700', Info, 'text-brand-600'],
    warn: ['bg-amber-50 border-amber-200 text-amber-900', AlertTriangle, 'text-amber-600'],
    good: ['bg-emerald-50 border-emerald-200 text-emerald-900', CheckCircle2, 'text-emerald-600'],
    bad: ['bg-rose-50 border-rose-200 text-rose-900', TrendingDown, 'text-rose-600'],
  }[tone];
  const Icon = styles[1];
  return (
    <div className={`flex gap-2 text-xs border rounded-lg p-3 ${styles[0]}`}>
      <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${styles[2]}`} />
      <div>{children}</div>
    </div>
  );
}

function SimpleTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-900 text-white text-xs rounded-lg p-2.5 shadow-lg min-w-[140px]">
      <div className="font-semibold text-surface-200 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-surface-300">
            <span className="w-2 h-2 rounded-sm" style={{ background: p.color || p.fill }} />
            {p.name}
          </span>
          <span className="font-mono font-bold">{num(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function StackedMonthly({ data, keys, names = {}, height = 240 }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.map((d) => ({ ...d, label: monthLabel(d.month) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} />
          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={40} />
          <Tooltip content={<SimpleTooltip />} cursor={{ fill: '#f1f5f9' }} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          {keys.map((k, i) => (
            <Bar key={k} dataKey={k} name={names[k] || k} stackId="a" fill={PALETTE[i % PALETTE.length]} maxBarSize={40} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── 1. New vs returning ────────────────────────────────────────────────────

function VisitorsSection({ args }) {
  const q = useGetInsightsQuery({ ...args, section: 'visitors' }, { skip: !args.websiteId });
  return (
    <SectionCard id="visitors" icon={Users} title="New vs returning visitors" subtitle="From GA4. Unique users for the selected period.">
      <QueryState query={q}>
        {(d) => (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                ['New visitors', d.new, '#2563eb'],
                ['Returning visitors', d.returning, '#10b981'],
              ].map(([label, v, color]) => (
                <div key={label} className="rounded-xl border border-surface-200 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-surface-800 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                      {label}
                    </p>
                    <p className="text-2xl font-semibold tabular-nums">{num(v.users)}</p>
                  </div>
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-x-4 gap-y-2 mt-3 text-xs">
                    <div>
                      <p className="text-surface-400">Sessions</p>
                      <p className="font-medium tabular-nums">{num(v.sessions)}</p>
                    </div>
                    <div>
                      <p className="text-surface-400">Engagement</p>
                      <p className="font-medium tabular-nums">{pct(v.engagementRate)}</p>
                    </div>
                    <div>
                      <p className="text-surface-400">Time / user</p>
                      <p className="font-medium tabular-nums">{dur(v.avgEngagementTimeSec)}</p>
                    </div>
                    <div>
                      <p className="text-surface-400">Pages / session</p>
                      <p className="font-medium tabular-nums">{v.pagesPerSession}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Note>
              <strong>{pct(d.returningShare)}</strong> of visitors came back.{' '}
              {d.returning.engagementRate > d.new.engagementRate &&
                `Returning visitors engage far more (${pct(d.returning.engagementRate)} vs ${pct(d.new.engagementRate)}), so bringing people back (newsletter, retargeting, internal links) pays off. `}
              {d.note}
            </Note>
            <StackedMonthly data={d.monthly} keys={['new', 'returning']} names={{ new: 'New', returning: 'Returning' }} />
          </div>
        )}
      </QueryState>
    </SectionCard>
  );
}

// ─── 2. Forms ───────────────────────────────────────────────────────────────

function FormsSection({ args }) {
  const q = useGetInsightsQuery({ ...args, section: 'forms' }, { skip: !args.websiteId });
  return (
    <SectionCard id="forms" icon={FileInput} title="Form activity" subtitle="Who started a form, who sent it, and which pages the forms are on.">
      <QueryState query={q}>
        {(d) => (
          <div className="space-y-4">
            {!d.tracking.formStart && (
              <Note tone="warn">
                No <code>form_start</code> events yet. GA4 records them once <strong>Form interactions</strong> is on in Enhanced
                measurement, starting from the day it was switched on, and they show up here within 24–48 hours. If they still
                don&apos;t appear after 2 days, the forms may be inside an iframe or built without a <code>&lt;form&gt;</code> tag, and
                need a Google Tag Manager setup instead.
              </Note>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Started a form" value={num(d.totals.started)} sub={d.totals.startedUsers ? `${num(d.totals.startedUsers)} people` : 'form_start'} />
              <Stat label="Submitted" value={num(d.totals.submitted)} sub="form_submit" />
              <Stat label="Thank-you completions" value={num(d.totals.thankYou)} sub="Contact_Thank_You event" tone={d.totals.thankYou ? 'good' : undefined} />
              <Stat
                label="Abandoned"
                value={d.totals.abandonRate === null ? '—' : pct(d.totals.abandonRate)}
                sub="started but didn't submit"
                tone={d.totals.abandonRate > 60 ? 'bad' : undefined}
              />
            </div>
            {d.monthly.length > 0 && (
              <StackedMonthly
                data={d.monthly}
                keys={['form_start', 'form_submit', 'Contact_Thank_You'].filter((k) => d.monthly.some((m) => m[k]))}
                names={{ form_start: 'Started', form_submit: 'Submitted', Contact_Thank_You: 'Thank-you' }}
                height={200}
              />
            )}
            {d.pages.length > 0 && (
              <div className="overflow-x-auto border border-surface-200 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 text-2xs text-surface-500 uppercase tracking-wider">
                    <tr>
                      <th className="text-left font-semibold px-4 py-2">Page</th>
                      <th className="text-right font-semibold px-4 py-2">Views</th>
                      {d.tracking.formStart && (
                        <>
                          <th className="text-right font-semibold px-4 py-2">Started</th>
                          <th className="text-right font-semibold px-4 py-2">Start rate</th>
                          <th className="text-right font-semibold px-4 py-2">Submitted</th>
                          <th className="text-right font-semibold px-4 py-2">Completion</th>
                        </>
                      )}
                      <th className="text-right font-semibold px-4 py-2">Thank-you</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {d.pages.map((p) => (
                      <tr key={p.path} className="hover:bg-surface-50/60">
                        <td className="px-4 py-2 text-surface-800 max-w-[320px] truncate" title={p.path}>{p.path}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{num(p.views)}</td>
                        {d.tracking.formStart && (
                          <>
                            <td className="px-4 py-2 text-right tabular-nums">{num(p.started)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-surface-500">{pct(p.startRate)}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{num(p.submitted)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-surface-500">{pct(p.completionRate)}</td>
                          </>
                        )}
                        <td className="px-4 py-2 text-right tabular-nums">{num(p.thankYou)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </QueryState>
    </SectionCard>
  );
}

// ─── 3. AI visitors ─────────────────────────────────────────────────────────

function AiSection({ args }) {
  const q = useGetInsightsQuery({ ...args, section: 'ai-visitors' }, { skip: !args.websiteId });
  return (
    <SectionCard id="ai" icon={Bot} title="AI visitors" subtitle="People who clicked through to the site from ChatGPT, Perplexity, Claude, Gemini, Copilot and other AI tools.">
      <QueryState query={q}>
        {(d) =>
          d.totals.sessions === 0 ? (
            <Note>No visits from AI tools in this period.</Note>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="AI sessions" value={num(d.totals.sessions)} sub={`${num(d.totals.users)} people`} />
                <Stat label="Share of all traffic" value={pct(d.totals.shareOfAllSessions, 2)} />
                <Stat label="Engagement rate" value={pct(d.totals.engagementRate)} />
                <Stat label="Top AI source" value={d.platforms[0]?.platform || '—'} sub={`${num(d.platforms[0]?.sessions)} sessions`} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-surface-600 mb-2">By AI tool</p>
                  <div className="space-y-2">
                    {d.platforms.map((p, i) => (
                      <div key={p.platform} className="text-xs">
                        <div className="flex justify-between mb-0.5">
                          <span className="font-medium text-surface-700">{p.platform}</span>
                          <span className="tabular-nums text-surface-500">
                            {num(p.sessions)} sessions · {pct(p.engagementRate)} engaged
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-100 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(p.sessions / d.platforms[0].sessions) * 100}%`, background: PALETTE[i % PALETTE.length] }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-surface-600 mb-2">By month</p>
                  <StackedMonthly data={d.monthly} keys={d.platformNames} height={200} />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-surface-600 mb-2">Pages AI tools send people to</p>
                <div className="overflow-x-auto border border-surface-200 rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-50 text-2xs text-surface-500 uppercase tracking-wider">
                      <tr>
                        <th className="text-left font-semibold px-4 py-2">Landing page</th>
                        <th className="text-left font-semibold px-4 py-2">From</th>
                        <th className="text-right font-semibold px-4 py-2">Sessions</th>
                        <th className="text-right font-semibold px-4 py-2">Engaged</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {d.pages.map((p) => (
                        <tr key={p.path}>
                          <td className="px-4 py-2 text-surface-800 max-w-[320px] truncate" title={p.path}>{p.path}</td>
                          <td className="px-4 py-2">
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(p.platforms).map(([name, n]) => (
                                <span key={name} className="badge-gray">
                                  {name} {n}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{num(p.sessions)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-surface-500">{pct(p.engagementRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        }
      </QueryState>
    </SectionCard>
  );
}

// ─── 4. Channels ────────────────────────────────────────────────────────────

const STATUS = {
  growing: ['Growing', 'bg-emerald-50 text-emerald-700', TrendingUp],
  declining: ['Declining', 'bg-rose-50 text-rose-700', TrendingDown],
  stable: ['Stable', 'bg-surface-100 text-surface-600', Minus],
  new: ['New', 'bg-brand-50 text-brand-700', Sparkles],
  too_little_data: ['Too little data', 'bg-surface-50 text-surface-400', Minus],
};

function Sparkbars({ series }) {
  const max = Math.max(1, ...series.map((s) => s.sessions));
  return (
    <div className="flex items-end gap-[2px] h-7 w-28">
      {series.map((s) => (
        <div
          key={s.month}
          title={`${monthLabel(s.month)}: ${num(s.sessions)}`}
          className="flex-1 rounded-sm bg-brand-500"
          style={{ height: `${Math.max(4, (s.sessions / max) * 100)}%`, opacity: s.partial ? 0.4 : 1 }}
        />
      ))}
    </div>
  );
}

function ChannelsSection({ args }) {
  const q = useGetInsightsQuery({ ...args, section: 'channels' }, { skip: !args.websiteId });
  return (
    <SectionCard
      id="channels"
      icon={TrendingUp}
      title="Channel performance"
      subtitle="Compares average sessions per month in the last 3 full months with the 3 months before. Growing or declining = a change of 15% or more."
    >
      <QueryState query={q}>
        {(d) => {
          const hasKeyEvents = d.channels.some((c) => c.keyEvents > 0);
          return (
            <div className="space-y-4">
              {d.patterns.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-surface-600">What the pattern shows</p>
                  {d.patterns.map((p, i) => (
                    <Note key={i} tone={p.type}>
                      {p.text}
                    </Note>
                  ))}
                </div>
              )}
              <div className="overflow-x-auto border border-surface-200 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 text-2xs text-surface-500 uppercase tracking-wider">
                    <tr>
                      <th className="text-left font-semibold px-4 py-2">Channel</th>
                      <th className="text-left font-semibold px-4 py-2">Trend</th>
                      <th className="text-left font-semibold px-4 py-2">Monthly</th>
                      <th className="text-right font-semibold px-4 py-2">Sessions</th>
                      <th className="text-right font-semibold px-4 py-2">Share</th>
                      <th className="text-right font-semibold px-4 py-2">Avg/month: last 3 vs before</th>
                      <th className="text-right font-semibold px-4 py-2">Engagement</th>
                      {hasKeyEvents && <th className="text-right font-semibold px-4 py-2">Key event rate</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {d.channels.map((c) => {
                      const [label, cls, Icon] = STATUS[c.status] || STATUS.stable;
                      return (
                        <tr key={c.channel} className="hover:bg-surface-50/60">
                          <td className="px-4 py-2 font-medium text-surface-800">
                            {c.channel}
                            {c.anomaly && (
                              <span className={`ml-2 text-2xs font-medium ${c.anomaly === 'spike' ? 'text-amber-600' : 'text-rose-600'}`}>
                                {c.anomaly === 'spike' ? '⚡ spike' : '⚠ drop'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium ${cls}`}>
                              <Icon className="w-3 h-3" />
                              {label}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <Sparkbars series={c.series} />
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{num(c.sessions)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-surface-500">{pct(c.share)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-xs">
                            <span className="text-surface-500">
                              {num(c.recentAvg)} vs {num(c.priorAvg)}
                            </span>
                            {c.change3m !== null && (
                              <span className={`ml-1.5 font-semibold ${c.change3m >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {c.change3m >= 0 ? '+' : ''}
                                {c.change3m > 999 ? '999+' : c.change3m}%
                              </span>
                            )}
                          </td>
                          <td className={`px-4 py-2 text-right tabular-nums ${c.engagementRate < 30 ? 'text-rose-600' : ''}`}>{pct(c.engagementRate)}</td>
                          {hasKeyEvents && <td className="px-4 py-2 text-right tabular-nums">{pct(c.keyEventRate, 2)}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!hasKeyEvents && (
                <Note>
                  No GA4 key events (conversions) are set up, so channels can&apos;t be compared on leads yet. In GA4 go to{' '}
                  <strong>Admin → Events</strong> and mark <code>Contact_Thank_You</code> (and <code>form_submit</code>) as key events.
                </Note>
              )}
            </div>
          );
        }}
      </QueryState>
    </SectionCard>
  );
}

// ─── 5. Pages to fix + 6. All pages ─────────────────────────────────────────

const ISSUE_STYLE = {
  low_scroll: 'bg-amber-50 text-amber-700',
  low_engagement: 'bg-rose-50 text-rose-700',
  low_ctr: 'bg-purple-50 text-purple-700',
  striking_distance: 'bg-brand-50 text-brand-700',
  intent_mismatch: 'bg-rose-50 text-rose-700',
  frustration: 'bg-orange-50 text-orange-700',
  visibility_no_visits: 'bg-surface-100 text-surface-600',
};

function AttentionSection({ query }) {
  return (
    <SectionCard
      id="attention"
      icon={Lightbulb}
      title="Pages to fix"
      subtitle="Pages with low scroll, low engagement or weak search click-through, ranked by how much traffic is at stake."
    >
      <QueryState query={query}>
        {(d) => (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Site engagement rate" value={pct(d.siteAverages.engagementRate)} />
              <Stat label="Views reaching 90% scroll" value={pct(d.siteAverages.scroll90Rate)} sub="GA4 scroll event" />
              <Stat label="Search CTR" value={pct(d.siteAverages.ctr, 2)} />
            </div>
            {d.needsAttention.length === 0 ? (
              <Note tone="good">No pages stand out as needing attention in this period.</Note>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {d.needsAttention.map((p) => (
                  <div key={p.path} className="rounded-xl border border-surface-200 p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <a href={p.url || '#'} target="_blank" rel="noreferrer" className="text-sm font-semibold text-surface-900 hover:text-brand-600 break-all">
                        {p.path}
                      </a>
                      {p.heatmapUrl && (
                        <a
                          href={p.heatmapUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-shrink-0 inline-flex items-center gap-1 text-2xs font-medium text-brand-600 hover:underline"
                        >
                          <Flame className="w-3 h-3" />
                          Heatmap
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-surface-500">
                      <span>{num(p.views)} views</span>
                      <span>{pct(p.engagementRate)} engaged</span>
                      <span>{pct(p.scroll90Rate)} reach 90%</span>
                      {p.impressions > 0 && <span>{num(p.impressions)} impressions · {pct(p.ctr, 2)} CTR · pos {p.position ?? '—'}</span>}
                    </div>
                    <ul className="space-y-1.5">
                      {p.issues.map((i) => (
                        <li key={i.type} className="text-xs text-surface-700">
                          <span className={`inline-block mr-1.5 px-1.5 py-0.5 rounded text-2xs font-semibold ${ISSUE_STYLE[i.type] || 'bg-surface-100'}`}>
                            {i.label}
                          </span>
                          {i.detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {!d.clarityProjectId && <Note>Connect Microsoft Clarity to this website to get heatmap links for each page.</Note>}
          </div>
        )}
      </QueryState>
    </SectionCard>
  );
}

const PAGE_COLUMNS = [
  { key: 'impressions', label: 'Impr.', fmt: num, src: 'GSC' },
  { key: 'clicks', label: 'Clicks', fmt: num, src: 'GSC' },
  { key: 'ctr', label: 'CTR', fmt: (v) => pct(v, 2), src: 'GSC' },
  { key: 'position', label: 'Pos.', fmt: (v) => (v ?? '—'), src: 'GSC', lowerIsBetter: true },
  { key: 'sessions', label: 'Sessions', fmt: num, src: 'GA4' },
  { key: 'engagementRate', label: 'Engaged', fmt: pct, src: 'GA4' },
  { key: 'avgEngagementSec', label: 'Time', fmt: dur, src: 'GA4' },
  { key: 'scroll90Rate', label: 'Scroll 90%', fmt: pct, src: 'GA4' },
  { key: 'aiSessions', label: 'AI visits', fmt: num, src: 'GA4' },
  { key: 'clarityScroll', label: 'Scroll depth', fmt: pct, src: 'Clarity' },
];

function PagesSection({ query }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'sessions', dir: 'desc' });
  const [limit, setLimit] = useState(50);

  return (
    <SectionCard
      id="pages"
      icon={Search}
      title="Page performance"
      subtitle="Search (GSC), on-site behaviour (GA4) and Clarity side by side, matched by page path."
      right={
        <input
          className="input w-56"
          placeholder="Filter pages…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(50);
          }}
        />
      }
    >
      <QueryState query={query}>
        {(d) => {
          const rows = d.pages
            .map((p) => ({ ...p, clarityScroll: p.clarity?.scrollDepth ?? null }))
            .filter((p) => !search || p.path.includes(search.toLowerCase()))
            .sort((a, b) => {
              const av = a[sort.key] ?? -Infinity;
              const bv = b[sort.key] ?? -Infinity;
              return sort.dir === 'desc' ? bv - av : av - bv;
            });
          const clarityHasScroll = d.pages.some((p) => p.clarity?.scrollDepth);
          return (
            <div className="space-y-3">
              <p className="text-2xs text-surface-400">
                {num(d.totalPages)} pages. Search Console data from {d.dataFrom.gsc || '—'}
                {d.dataFrom.clarity ? `, Clarity from ${d.dataFrom.clarity}` : ', no Clarity data in this period'}.
                {!clarityHasScroll && ' Clarity has no per-page scroll depth yet, so use the GA4 "Scroll 90%" column.'}
              </p>
              <div className="overflow-x-auto border border-surface-200 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 text-2xs text-surface-500 uppercase tracking-wider">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2 sticky left-0 bg-surface-50">Page</th>
                      {PAGE_COLUMNS.map((c) => (
                        <th key={c.key} className="text-right font-semibold px-3 py-2 whitespace-nowrap">
                          <button
                            type="button"
                            className={`inline-flex items-center gap-1 hover:text-surface-800 ${sort.key === c.key ? 'text-surface-900' : ''}`}
                            onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === 'desc' ? 'asc' : 'desc' }))}
                          >
                            {c.label}
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                          <span className="block text-[9px] font-normal normal-case text-surface-400">{c.src}</span>
                        </th>
                      ))}
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {rows.slice(0, limit).map((p) => (
                      <tr key={p.path} className="hover:bg-surface-50/60">
                        <td className="px-3 py-2 text-surface-800 max-w-[280px] truncate sticky left-0 bg-white" title={p.path}>
                          {p.path}
                          {p.issues.length > 0 && (
                            <span className="ml-1.5 text-2xs text-amber-600" title={p.issues.map((i) => i.label).join(', ')}>
                              ● {p.issues.length}
                            </span>
                          )}
                        </td>
                        {PAGE_COLUMNS.map((c) => {
                          const v = p[c.key];
                          const warn =
                            (c.key === 'scroll90Rate' && v !== null && p.views >= 30 && v < d.siteAverages.scroll90Rate * 0.6) ||
                            (c.key === 'engagementRate' && v !== null && p.sessions >= 30 && v < d.siteAverages.engagementRate * 0.7);
                          return (
                            <td key={c.key} className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${warn ? 'text-rose-600 font-medium' : ''}`}>
                              {c.fmt(v)}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right">
                          {p.heatmapUrl && (
                            <a href={p.heatmapUrl} target="_blank" rel="noreferrer" title="Open Clarity heatmap" className="text-surface-400 hover:text-brand-600">
                              <Flame className="w-4 h-4" />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > limit && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLimit((l) => l + 50)}>
                  Show more ({num(rows.length - limit)} left)
                </button>
              )}
            </div>
          );
        }}
      </QueryState>
    </SectionCard>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const workspace = useSelector(selectActiveWorkspace);
  const workspaceId = workspace?.id;
  const saved = useMemo(loadSaved, []);
  const [websiteId, setWebsiteId] = useState(saved.websiteId || '');
  const [period, setPeriod] = useState(saved.period || '12m');

  const { data: websitesData } = useGetWebsitesQuery({ workspaceId }, { skip: !workspaceId });
  const websites = websitesData?.data || [];

  useEffect(() => {
    if (websites.length && !websites.some((w) => w.id === websiteId)) setWebsiteId(websites[0].id);
  }, [websites, websiteId]);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ websiteId, period }));
  }, [websiteId, period]);

  const args = { workspaceId, websiteId, ...rangeFor(period) };
  // "Pages to fix" and "All pages" share one request
  const pagesQuery = useGetInsightsQuery({ ...args, section: 'pages' }, { skip: !websiteId });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-surface-900 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-brand-600" />
            Insights
          </h1>
          <p className="text-sm text-surface-500 mt-1">Who visits, where they come from, and which pages need work.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select className="input w-64" value={websiteId} onChange={(e) => setWebsiteId(e.target.value)} disabled={!websites.length}>
            {!websites.length && <option value="">No websites yet</option>}
            {websites.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.domain})
              </option>
            ))}
          </select>
          <select className="input w-44" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Jump links */}
      <nav className="flex flex-wrap gap-2">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#insights-${id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(`insights-${id}`)?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 bg-white text-xs font-medium text-surface-600 hover:text-surface-900 hover:border-surface-300"
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </a>
        ))}
      </nav>

      {!websiteId ? (
        <div className="card p-10 text-center text-sm text-surface-500">Add a website to see insights.</div>
      ) : (
        <>
          <VisitorsSection args={args} />
          <FormsSection args={args} />
          <AiSection args={args} />
          <ChannelsSection args={args} />
          <AttentionSection query={pagesQuery} />
          <PagesSection query={pagesQuery} />
        </>
      )}
    </div>
  );
}
