// frontend/src/pages/integrations/IntegrationsPage.jsx
import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectActiveWorkspace } from '../../features/auth/authSlice.js';
import {
  useGetGoogleAccountsQuery,
  useLazyGetGoogleAuthUrlQuery,
  useDisconnectGoogleAccountMutation,
  useGetClarityConnectionsQuery,
  useDisconnectClarityProjectMutation,
} from '../../features/integrations/integrationsApi.js';
import Modal from '../../components/common/Modal.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import ConnectClarityModal from '../../features/integrations/components/ConnectClarityModal.jsx';
import {
  Link2,
  Unlink,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Globe,
  Database,
  Zap,
  Clock,
  Key,
  BarChart3,
  Search,
} from 'lucide-react';

export default function IntegrationsPage() {
  const workspace = useSelector(selectActiveWorkspace);
  const [searchParams, setSearchParams] = useSearchParams();

  // Google Disconnect & Setup state
  const [googleDisconnectModalOpen, setGoogleDisconnectModalOpen] = useState(false);
  const [googleAccountToDisconnect, setGoogleAccountToDisconnect] = useState(null);
  const [googleSetupModalOpen, setGoogleSetupModalOpen] = useState(false);

  // Clarity Connect & Disconnect state
  const [clarityModalOpen, setClarityModalOpen] = useState(false);
  const [clarityDisconnectModalOpen, setClarityDisconnectModalOpen] = useState(false);
  const [clarityToDisconnect, setClarityToDisconnect] = useState(null);

  const googleConnected = searchParams.get('google_connected');
  const googleError = searchParams.get('error');

  // Google accounts query
  const { data: accountsData, isLoading: isLoadingGoogle, refetch: refetchGoogle } =
    useGetGoogleAccountsQuery(workspace?.id, { skip: !workspace?.id });

  // Clarity connections query
  const { data: clarityData, isLoading: isLoadingClarity, refetch: refetchClarity } =
    useGetClarityConnectionsQuery(workspace?.id, { skip: !workspace?.id });

  const [triggerAuthUrl, { isFetching: isGeneratingUrl }] = useLazyGetGoogleAuthUrlQuery();
  const [disconnectGoogle, { isLoading: isDisconnectingGoogle }] =
    useDisconnectGoogleAccountMutation();
  const [disconnectClarity, { isLoading: isDisconnectingClarity }] =
    useDisconnectClarityProjectMutation();

  const googleAccounts = accountsData?.data || [];
  const clarityConnections = clarityData?.data || [];

  const handleConnectGoogle = async () => {
    try {
      const res = await triggerAuthUrl(workspace?.id).unwrap();
      if (res?.data?.authUrl) {
        window.location.href = res.data.authUrl;
      }
    } catch (err) {
      const msg = err?.data?.message || err.message || '';
      if (msg.includes('Google OAuth credentials missing') || msg.includes('GOOGLE_CLIENT_ID')) {
        setGoogleSetupModalOpen(true);
      } else {
        alert(`Failed to initiate Google OAuth: ${msg}`);
      }
    }
  };

  const confirmDisconnectGoogle = async () => {
    if (!googleAccountToDisconnect) return;
    try {
      await disconnectGoogle({
        workspaceId: workspace?.id,
        accountId: googleAccountToDisconnect.id,
      }).unwrap();
      setGoogleDisconnectModalOpen(false);
      setGoogleAccountToDisconnect(null);
    } catch (err) {
      alert(`Failed to disconnect: ${err?.data?.message || err.message}`);
    }
  };

  const confirmDisconnectClarity = async () => {
    if (!clarityToDisconnect) return;
    try {
      await disconnectClarity({
        workspaceId: workspace?.id,
        connectionId: clarityToDisconnect.id,
      }).unwrap();
      setClarityDisconnectModalOpen(false);
      setClarityToDisconnect(null);
    } catch (err) {
      alert(`Failed to disconnect Clarity project: ${err?.data?.message || err.message}`);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Banner Notifications */}
      {googleConnected && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span className="text-sm font-medium">
              Google Account connected successfully! You can now map GA4 and GSC properties to your client websites.
            </span>
          </div>
          <button
            onClick={() => setSearchParams({})}
            className="text-xs text-emerald-700 hover:underline font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {googleError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <span className="text-sm font-medium">
              Google Authorization Notice: {decodeURIComponent(googleError)}
            </span>
          </div>
          <button
            onClick={() => setSearchParams({})}
            className="text-xs text-rose-700 hover:underline font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Integrations Hub</h1>
          <p className="text-sm text-surface-500 mt-1">
            Connect centralized Google Accounts and Microsoft Clarity projects to feed performance intelligence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setClarityModalOpen(true)}
            className="btn-secondary inline-flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <Zap className="w-4 h-4 text-brand-600" />
            <span>Connect Microsoft Clarity</span>
          </button>

          <button
            onClick={handleConnectGoogle}
            disabled={isGeneratingUrl}
            className="btn-primary inline-flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            {isGeneratingUrl ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Link2 className="w-4 h-4" />
            )}
            <span>Connect Google Account</span>
          </button>
        </div>
      </div>

      {/* Security & Multi-Site Notice */}
      <div className="p-4 rounded-xl border border-brand-100 bg-brand-50/50 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-brand-600 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-surface-600 space-y-1">
          <p className="font-semibold text-surface-800">
            Enterprise Multi-Site Architecture & Privacy
          </p>
          <p>
            You only need to connect an agency or client Google/Clarity credential once per workspace. After connecting,
            you can link any GA4 property, Search Console site, or Clarity project to specific client websites under your workspace.
            All tokens are encrypted locally with AES-256-GCM.
          </p>
        </div>
      </div>

      <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-surface-900">Sync website data</h2>
          <p className="text-xs text-surface-500 mt-1">Choose a website to import its connected GA4, Search Console, or Clarity data.</p>
        </div>
        <Link to="/websites" className="btn-primary inline-flex items-center justify-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" />
          <span>Open website sync</span>
        </Link>
      </div>

      {/* ─── SECTION 1: GOOGLE ACCOUNTS (GA4 & GSC) ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="card p-5 flex flex-col justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center"><BarChart3 className="w-5 h-5" /></div>
            <div>
              <div className="flex items-center gap-2"><h2 className="font-semibold text-surface-900">Google Analytics 4</h2><span className="text-2xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono">GA4</span></div>
              <p className="mt-1 text-xs text-surface-500">Connect a GA4 property to a website for sessions, engagement, and conversion reporting.</p>
              <p className="mt-2 text-xs text-surface-500">{googleAccounts.length > 0 ? `Google authorization available (${googleAccounts.length} account${googleAccounts.length === 1 ? '' : 's'}).` : 'Authorize a Google account first, then select a GA4 property.'} Enable the Google Analytics Admin API and Data API in Google Cloud.</p>
            </div>
          </div>
          {googleAccounts.length > 0 ? <Link to="/websites" className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"><span>Choose website and GA4 property</span><ExternalLink className="w-3.5 h-3.5" /></Link> : <button onClick={handleConnectGoogle} disabled={isGeneratingUrl} className="btn-primary text-sm">Authorize Google for GA4</button>}
        </section>
        <section className="card p-5 flex flex-col justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center"><Search className="w-5 h-5" /></div>
            <div>
              <div className="flex items-center gap-2"><h2 className="font-semibold text-surface-900">Google Search Console</h2><span className="text-2xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-mono">GSC</span></div>
              <p className="mt-1 text-xs text-surface-500">Connect a verified Search Console site for clicks, impressions, queries, and rankings.</p>
              <p className="mt-2 text-xs text-surface-500">{googleAccounts.length > 0 ? `Google authorization available (${googleAccounts.length} account${googleAccounts.length === 1 ? '' : 's'}).` : 'Authorize a Google account first, then select a verified Search Console site.'} Enable the Google Search Console API and grant the account access to the site.</p>
            </div>
          </div>
          {googleAccounts.length > 0 ? <Link to="/websites" className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"><span>Choose website and Search Console site</span><ExternalLink className="w-3.5 h-3.5" /></Link> : <button onClick={handleConnectGoogle} disabled={isGeneratingUrl} className="btn-primary text-sm">Authorize Google for Search Console</button>}
        </section>
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between pb-4 border-b border-surface-100 mb-6">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-surface-400" />
            <h2 className="text-base font-semibold text-surface-900">
              Google Accounts ({googleAccounts.length}) — GA4 & Search Console
            </h2>
          </div>
          <button
            onClick={() => refetchGoogle()}
            className="text-xs text-surface-500 hover:text-surface-800 flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {isLoadingGoogle ? (
          <div className="py-12 text-center text-sm text-surface-400">Loading connected accounts…</div>
        ) : googleAccounts.length === 0 ? (
          <EmptyState
            title="No Google Accounts Connected"
            description="Authorize a Google account to unlock automated property discovery and performance data collection for GA4 and Google Search Console."
            actionText="Connect Google Account"
            onAction={handleConnectGoogle}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {googleAccounts.map((acc) => (
              <div
                key={acc.id}
                className="p-5 rounded-xl border border-surface-200 bg-surface-50 flex flex-col justify-between space-y-4 hover:border-surface-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {acc.avatarUrl ? (
                      <img
                        src={acc.avatarUrl}
                        alt={acc.displayName || acc.email}
                        className="w-10 h-10 rounded-full object-cover border border-surface-200"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
                        {acc.email.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h3 className="text-sm font-semibold text-surface-900">
                        {acc.displayName || acc.email}
                      </h3>
                      <p className="text-xs text-surface-500">{acc.email}</p>
                    </div>
                  </div>

                  <span
                    className={`text-2xs px-2 py-0.5 rounded-full font-semibold ${
                      acc.status === 'CONNECTED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {acc.status}
                  </span>
                </div>

                <div className="pt-3 border-t border-surface-200 text-xs text-surface-500 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-surface-400" />
                    <span>
                      {acc.connectedIntegrationsCount} active website{' '}
                      {acc.connectedIntegrationsCount === 1 ? 'link' : 'links'}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setGoogleAccountToDisconnect(acc);
                      setGoogleDisconnectModalOpen(true);
                    }}
                    className="text-xs font-medium text-rose-600 hover:text-rose-700 flex items-center gap-1"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── SECTION 2: MICROSOFT CLARITY PROJECTS ──────────────────────── */}
      <div className="card p-6">
        <div className="flex items-center justify-between pb-4 border-b border-surface-100 mb-6">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand-600" />
            <div>
              <h2 className="text-base font-semibold text-surface-900">
                Microsoft Clarity Projects ({clarityConnections.length})
              </h2>
              <p className="text-xs text-surface-500">
                Data Export API tokens connecting user behavior and friction metrics
              </p>
            </div>
          </div>
          <button
            onClick={() => refetchClarity()}
            className="text-xs text-surface-500 hover:text-surface-800 flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {isLoadingClarity ? (
          <div className="py-12 text-center text-sm text-surface-400">Loading Clarity projects…</div>
        ) : clarityConnections.length === 0 ? (
          <EmptyState
            title="No Microsoft Clarity Projects Connected"
            description="Add an authorized Microsoft Clarity Data Export API token to track dead clicks, rage clicks, quickbacks, and user scroll depth."
            actionText="Connect Clarity Project"
            onAction={() => setClarityModalOpen(true)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clarityConnections.map((conn) => (
              <div
                key={conn.id}
                className="p-5 rounded-xl border border-surface-200 bg-surface-50 flex flex-col justify-between space-y-4 hover:border-surface-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-surface-900">
                        {conn.projectName || conn.projectId}
                      </h3>
                      <p className="text-xs text-surface-500 font-mono">Project ID: {conn.projectId}</p>
                    </div>
                  </div>

                  <span
                    className={`text-2xs px-2 py-0.5 rounded-full font-semibold ${
                      conn.status === 'CONNECTED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {conn.status}
                  </span>
                </div>

                <div className="pt-3 border-t border-surface-200 text-xs text-surface-500 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Database className="w-3.5 h-3.5 text-surface-400" />
                      {conn.connectedWebsitesCount} websites
                    </span>
                    <span className="flex items-center gap-1 font-mono text-2xs bg-surface-200 px-1.5 py-0.5 rounded">
                      <Clock className="w-3 h-3 text-surface-400" />
                      {conn.apiCallsToday}/10 calls today
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setClarityToDisconnect(conn);
                      setClarityDisconnectModalOpen(true);
                    }}
                    className="text-xs font-medium text-rose-600 hover:text-rose-700 flex items-center gap-1"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connect Clarity Project Modal */}
      <ConnectClarityModal
        isOpen={clarityModalOpen}
        onClose={() => setClarityModalOpen(false)}
        workspaceId={workspace?.id}
      />

      {/* Google OAuth Setup Guide Modal */}
      <Modal
        isOpen={googleSetupModalOpen}
        onClose={() => setGoogleSetupModalOpen(false)}
        title="Google OAuth Setup Required"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4 text-xs text-surface-600">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
            <p className="font-semibold text-xs">Google OAuth Credentials Missing</p>
            <p className="mt-1 text-2xs text-amber-800">
              To connect Google Analytics 4 (GA4) or Google Search Console (GSC), you must configure your OAuth 2.0 credentials in the backend <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-amber-900">.env</code> file.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-semibold text-surface-900 text-xs">Quick Setup Instructions:</h4>
            <ol className="list-decimal pl-4 space-y-2 text-xs text-surface-700">
              <li>
                Visit the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-brand-600 underline font-medium inline-flex items-center gap-0.5">Google Cloud Console <ExternalLink className="w-3 h-3 inline" /></a>.
              </li>
              <li>
                Enable both <strong>Google Analytics Data API</strong> and <strong>Google Search Console API</strong> under <em>APIs & Services &gt; Library</em>.
              </li>
              <li>
                Create an <strong>OAuth 2.0 Client ID</strong> (Application type: <em>Web application</em>).
              </li>
              <li>
                Add the Authorized redirect URI:
                <div className="mt-1 bg-surface-100 p-2 rounded border border-surface-200 font-mono text-2xs text-surface-800 select-all">
                  http://localhost:3001/api/v1/integrations/google/callback
                </div>
              </li>
              <li>
                Copy your <strong>Client ID</strong> and <strong>Client Secret</strong> into <code className="font-mono bg-surface-100 px-1 py-0.5 rounded">backend/.env</code>:
                <pre className="mt-1.5 bg-surface-900 text-surface-100 p-2.5 rounded font-mono text-2xs overflow-x-auto whitespace-pre">
{`GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/v1/integrations/google/callback`}
                </pre>
              </li>
              <li>
                Restart the backend server (<code className="font-mono bg-surface-100 px-1 py-0.5 rounded">Ctrl + C</code> then <code className="font-mono bg-surface-100 px-1 py-0.5 rounded">npm run dev</code>).
              </li>
            </ol>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setGoogleSetupModalOpen(false)}
              className="btn-primary btn-sm"
            >
              Got it
            </button>
          </div>
        </div>
      </Modal>

      {/* Disconnect Google Confirmation Modal */}
      <Modal
        isOpen={googleDisconnectModalOpen}
        onClose={() => setGoogleDisconnectModalOpen(false)}
        title="Disconnect Google Account"
      >
        <div className="space-y-4">
          <p className="text-sm text-surface-600">
            Are you sure you want to disconnect{' '}
            <strong className="text-surface-900">{googleAccountToDisconnect?.email}</strong>?
          </p>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            All client websites mapped to this account will pause synchronisation until another account is associated. Previously imported historical metrics remain preserved.
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <button onClick={() => setGoogleDisconnectModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={confirmDisconnectGoogle}
              disabled={isDisconnectingGoogle}
              className="btn-danger"
            >
              {isDisconnectingGoogle ? 'Disconnecting…' : 'Disconnect Account'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Disconnect Clarity Confirmation Modal */}
      <Modal
        isOpen={clarityDisconnectModalOpen}
        onClose={() => setClarityDisconnectModalOpen(false)}
        title="Disconnect Microsoft Clarity Project"
      >
        <div className="space-y-4">
          <p className="text-sm text-surface-600">
            Are you sure you want to disconnect Clarity project{' '}
            <strong className="text-surface-900">{clarityToDisconnect?.projectName || clarityToDisconnect?.projectId}</strong>?
          </p>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            Associated websites will be unmapped. Previously imported snapshots and behavioral friction metrics remain preserved in your local database.
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <button onClick={() => setClarityDisconnectModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={confirmDisconnectClarity}
              disabled={isDisconnectingClarity}
              className="btn-danger"
            >
              {isDisconnectingClarity ? 'Disconnecting…' : 'Disconnect Project'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
