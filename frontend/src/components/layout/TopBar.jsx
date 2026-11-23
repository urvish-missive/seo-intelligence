// frontend/src/components/layout/TopBar.jsx
import React, { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import {
  selectCurrentUser,
  selectActiveWorkspace,
  selectCurrentRole,
  selectUserWorkspaces,
} from '../../features/auth/authSlice.js';
import { useSwitchWorkspaceMutation } from '../../features/workspace/workspaceApi.js';
import { useLogoutMutation } from '../../features/auth/authApi.js';
import { ChevronDown, Building, LogOut, Shield, Check, Menu, X } from 'lucide-react';

export default function TopBar({ onToggleMobileMenu, isMobileMenuOpen }) {
  const user = useSelector(selectCurrentUser);
  const activeWorkspace = useSelector(selectActiveWorkspace);
  const role = useSelector(selectCurrentRole);
  const workspaces = useSelector(selectUserWorkspaces);

  const [switchWorkspace, { isLoading: isSwitching }] = useSwitchWorkspaceMutation();
  const [logout] = useLogoutMutation();

  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const wsMenuRef = useRef(null);
  const profileMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wsMenuRef.current && !wsMenuRef.current.contains(e.target)) {
        setIsWorkspaceMenuOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setIsProfileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectWorkspace = async (wsId) => {
    if (wsId === activeWorkspace?.id) {
      setIsWorkspaceMenuOpen(false);
      return;
    }
    try {
      await switchWorkspace(wsId).unwrap();
      setIsWorkspaceMenuOpen(false);
    } catch (err) {
      console.error('Failed to switch workspace:', err);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-surface-200 flex items-center justify-between px-3 sm:px-6 z-20 flex-shrink-0">
      {/* Left: Mobile Menu Toggle & Active Workspace Selector */}
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={onToggleMobileMenu}
          className="md:hidden p-1.5 rounded-lg text-surface-600 hover:text-surface-900 hover:bg-surface-100 transition-colors"
          aria-label="Toggle navigation menu"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5 text-surface-800" /> : <Menu className="w-5 h-5 text-surface-800" />}
        </button>

        <div className="relative" ref={wsMenuRef}>
          <button
            onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
            className="flex items-center gap-1.5 sm:gap-2.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-surface-200 hover:border-surface-300 hover:bg-surface-50 text-xs sm:text-sm font-medium text-surface-800 transition-colors max-w-[150px] sm:max-w-xs"
            disabled={isSwitching}
          >
            <Building className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600 flex-shrink-0" />
            <span className="truncate">{activeWorkspace?.name || 'Workspace'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
          </button>

          {isWorkspaceMenuOpen && (
            <div className="absolute left-0 mt-1.5 w-60 rounded-lg bg-white border border-surface-200 shadow-dropdown py-1.5 z-30">
              <div className="px-3 py-1.5 text-2xs font-semibold text-surface-400 uppercase tracking-wider">
                Workspaces ({workspaces.length})
              </div>
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => handleSelectWorkspace(ws.id)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-surface-50 text-surface-800 transition-colors"
                >
                  <div>
                    <div className="font-medium">{ws.name}</div>
                    <div className="text-xs text-surface-400">{ws.role}</div>
                  </div>
                  {ws.id === activeWorkspace?.id && (
                    <Check className="w-4 h-4 text-brand-600" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: User Profile & Actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Role Badge */}
        {role && (
          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200">
            <Shield className="w-3 h-3" />
            {role.name || role.slug}
          </span>
        )}

        {/* User Menu */}
        <div className="relative" ref={profileMenuRef}>
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="flex items-center gap-1.5 sm:gap-2.5 p-1 rounded-lg hover:bg-surface-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-brand-600 text-white font-medium flex items-center justify-center text-sm shadow-xs flex-shrink-0">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="text-left hidden lg:block">
              <div className="text-xs font-semibold text-surface-800 leading-tight">{user?.name}</div>
              <div className="text-2xs text-surface-400 leading-tight">{user?.email}</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-surface-400" />
          </button>

          {isProfileMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-52 rounded-lg bg-white border border-surface-200 shadow-dropdown py-1 z-30">
              <div className="px-4 py-2 border-b border-surface-100">
                <div className="text-sm font-semibold text-surface-900">{user?.name}</div>
                <div className="text-xs text-surface-500 truncate">{user?.email}</div>
                {role && (
                  <div className="sm:hidden text-2xs text-brand-600 font-medium mt-0.5">
                    Role: {role.name || role.slug}
                  </div>
                )}
              </div>
              <button
                onClick={() => logout()}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-danger-500 hover:bg-danger-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
