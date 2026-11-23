// frontend/src/pages/dashboard/DashboardPage.jsx
import React from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  selectCurrentUser,
  selectActiveWorkspace,
  selectCurrentRole,
} from '../../features/auth/authSlice.js';
import { useGetWorkspaceStatsQuery } from '../../features/workspace/workspaceApi.js';
import {
  Building2,
  Globe,
  Users,
  Plus,
  ArrowRight,
  Shield,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import AgencyOverviewTable from '../../features/analytics/components/AgencyOverviewTable.jsx';

export default function DashboardPage() {
  const user = useSelector(selectCurrentUser);
  const workspace = useSelector(selectActiveWorkspace);
  const role = useSelector(selectCurrentRole);

  const { data: statsData, isLoading } = useGetWorkspaceStatsQuery(workspace?.id, {
    skip: !workspace?.id,
  });

  const metrics = statsData?.data?.metrics || {
    totalClients: 0,
    activeClients: 0,
    totalWebsites: 0,
    activeWebsites: 0,
    totalMembers: 0,
  };

  const recentActivity = statsData?.data?.recentActivity || [];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-surface-200">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
            Agency Overview
          </h1>
          <p className="text-sm text-surface-500 mt-1">
            Welcome back, <span className="font-semibold text-surface-700">{user?.name}</span> ·{' '}
            <span className="text-brand-600 font-medium">{workspace?.name || 'Workspace'}</span> (
            {role?.name || role?.slug})
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link to="/clients" className="btn-secondary">
            <Building2 className="w-4 h-4 text-surface-500" />
            <span>Manage Clients</span>
          </Link>
          <Link to="/websites" className="btn-primary">
            <Plus className="w-4 h-4" />
            <span>Add Website</span>
          </Link>
        </div>
      </div>

      {/* Primary Agency Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
              Total Clients
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-surface-900 mt-2">
            {isLoading ? '…' : metrics.totalClients}
          </div>
          <div className="text-xs text-surface-500 mt-1 flex items-center gap-1.5">
            <span className="font-medium text-emerald-600">{metrics.activeClients} active</span>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
              Tracked Websites
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Globe className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-surface-900 mt-2">
            {isLoading ? '…' : metrics.totalWebsites}
          </div>
          <div className="text-xs text-surface-500 mt-1 flex items-center gap-1.5">
            <span className="font-medium text-emerald-600">{metrics.activeWebsites} active</span>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
              Team Members
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-surface-900 mt-2">
            {isLoading ? '…' : metrics.totalMembers}
          </div>
          <div className="text-xs text-surface-500 mt-1">Multi-tenant RBAC enabled</div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
              Security Status
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base font-bold text-surface-900 mt-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Local Protected
          </div>
          <div className="text-xs text-surface-500 mt-1">Air-gapped AI & Encrypted Auth</div>
        </div>
      </div>

      {/* Multi-Client & Multi-Website SEO Intelligence Overview */}
      <AgencyOverviewTable workspaceId={workspace?.id} />

      {/* Progress & Implementation Roadmap */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-surface-900">Platform Build Status</h3>
          </div>
          <span className="badge-green text-xs">Phase 6: Live</span>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { phase: 'Phase 1', title: 'Architecture & Engine', status: 'done' },
              { phase: 'Phase 2', title: 'Agency Auth & RBAC', status: 'done' },
              { phase: 'Phase 3', title: 'Google GA4 & GSC', status: 'done' },
              { phase: 'Phase 4', title: 'Microsoft Clarity', status: 'done' },
              { phase: 'Phase 5', title: 'Redis & BullMQ Sync', status: 'done' },
              { phase: 'Phase 6', title: 'Analytics Dashboard', status: 'done' },
            ].map((p) => (
              <div
                key={p.phase}
                className={`p-3 rounded-lg border text-xs ${
                  p.status === 'done'
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                    : p.status === 'next'
                    ? 'bg-brand-50 border-brand-300 text-brand-900 font-medium'
                    : 'bg-surface-50 border-surface-200 text-surface-500'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold">{p.phase}</span>
                  {p.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                </div>
                <div className="truncate">{p.title}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity Audit Trail */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h3 className="text-sm font-semibold text-surface-900">Recent Workspace Activity</h3>
          <span className="text-xs text-surface-400">Audit trail verified</span>
        </div>
        <div className="card-body p-0">
          {recentActivity.length === 0 ? (
            <div className="p-8 text-center text-sm text-surface-400">
              No recent administrative actions recorded yet.
            </div>
          ) : (
            <ul className="divide-y divide-surface-100">
              {recentActivity.map((log) => (
                <li key={log.id} className="px-6 py-3.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                    <div>
                      <span className="font-semibold text-surface-800">{log.action}</span>
                      <span className="text-surface-400 ml-2">by {log.user?.name || 'System'}</span>
                    </div>
                  </div>
                  <span className="text-surface-400">
                    {new Date(log.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
