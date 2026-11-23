// frontend/src/components/layout/Sidebar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Globe,
  Users,
  ShieldCheck,
  BarChart3,
  Search,
  Sparkles,
  FileText,
  Plug,
  Terminal,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import { selectCurrentRole } from '../../features/auth/authSlice.js';

export default function Sidebar() {
  const currentRole = useSelector(selectCurrentRole);
  const isSuperOrAdmin = ['super_admin', 'admin'].includes(currentRole?.slug);

  const mainNavigation = [
    { name: 'Overview', href: '/', icon: LayoutDashboard },
    { name: 'Clients', href: '/clients', icon: Building2 },
    { name: 'Websites', href: '/websites', icon: Globe },
    { name: 'AI Assistant', href: '/ai-assistant', icon: Sparkles },
    { name: 'Reports', href: '/reports', icon: FileText },
    { name: 'Integrations', href: '/settings/integrations', icon: Plug },
    { name: 'Team Members', href: '/members', icon: Users },
    ...(isSuperOrAdmin ? [
      { name: 'Roles & RBAC', href: '/settings/roles', icon: ShieldCheck },
      { name: 'MCP Server', href: '/settings/mcp', icon: Terminal },
    ] : []),
  ];

  const comingPhasesNav = [
    { name: 'SEO Performance', icon: BarChart3, badge: 'Phase 6' },
    { name: 'Keywords', icon: Search, badge: 'Phase 7' },
  ];

  return (
    <aside className="w-64 bg-white border-r border-surface-200 flex flex-col flex-shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-surface-100">
        <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center text-white shadow-sm font-bold text-lg tracking-wider">
          M
        </div>
        <div>
          <span className="font-semibold text-surface-900 tracking-tight text-base">Missive SEO</span>
          <span className="block text-2xs text-surface-400 font-medium uppercase tracking-wider">
            Agency Intelligence
          </span>
        </div>
      </div>

      {/* Primary Navigation */}
      <div className="flex-1 px-4 py-5 space-y-6 overflow-y-auto scrollbar-thin">
        <div>
          <p className="px-3 text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
            Agency Management
          </p>
          <nav className="space-y-1">
            {mainNavigation.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  end={item.href === '/'}
                  className={({ isActive }) =>
                    isActive
                      ? 'sidebar-link sidebar-link-active'
                      : 'sidebar-link'
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Future Phase Capability Roadmap */}
        <div>
          <p className="px-3 text-2xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
            Intelligence Suite
          </p>
          <div className="space-y-1">
            {comingPhasesNav.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.name}
                  className="flex items-center justify-between px-3 py-2 text-xs font-medium text-surface-400 rounded-md cursor-not-allowed select-none"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 opacity-70" />
                    <span>{item.name}</span>
                  </div>
                  <span className="text-2xs bg-surface-100 text-surface-500 px-1.5 py-0.5 rounded">
                    {item.badge}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Local Infrastructure Status */}
      <div className="p-4 border-t border-surface-100">
        <div className="p-3 bg-surface-50 rounded-lg border border-surface-200">
          <div className="flex items-center justify-between text-xs font-medium text-surface-700">
            <span>Local Engine</span>
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <p className="text-2xs text-surface-400 mt-1">
            Privacy-First · Air-Gapped AI
          </p>
        </div>
      </div>
    </aside>
  );
}
