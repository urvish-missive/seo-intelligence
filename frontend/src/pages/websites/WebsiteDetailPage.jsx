// frontend/src/pages/websites/WebsiteDetailPage.jsx
import React, { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectActiveWorkspace } from '../../features/auth/authSlice.js';
import { useGetWebsiteQuery } from '../../features/websites/websitesApi.js';
import {
  useGetWebsiteIntegrationsQuery,
  useDisconnectWebsitePropertyMutation,
  useUnmapWebsiteFromClarityMutation,
} from '../../features/integrations/integrationsApi.js';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import PropertySelectModal from '../../features/integrations/components/PropertySelectModal.jsx';
import ManualSyncModal from '../../features/integrations/components/ManualSyncModal.jsx';
import StoredMetricsView from '../../features/integrations/components/StoredMetricsView.jsx';
import WebsiteAnalyticsDashboard from '../../features/analytics/components/WebsiteAnalyticsDashboard.jsx';
import ClarityMapModal from '../../features/integrations/components/ClarityMapModal.jsx';
import ClaritySyncModal from '../../features/integrations/components/ClaritySyncModal.jsx';
import ClarityMetricsView from '../../features/integrations/components/ClarityMetricsView.jsx';
import SyncManagementView from '../../features/sync/components/SyncManagementView.jsx';
import BingIntegrationCard from '../../features/integrations/components/BingIntegrationCard.jsx';
import {
  Globe,
  Building2,
  ExternalLink,
  ArrowLeft,
  Plug,
  Calendar,
  Layers,
  AlertCircle,
  Database,
  RefreshCw,
  Link2,
  Unlink,
  CheckCircle2,
  MousePointer,
  Flame,
  RotateCcw,
} from 'lucide-react';

export default function WebsiteDetailPage() {
  const { websiteId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspace = useSelector(selectActiveWorkspace);

  const [activeMainTab, setActiveMainTab] = useState('integrations'); // 'integrations' | 'analytics' | 'clarity'
  const [propertyModalOpen, setPropertyModalOpen] = useState(false);
  const [selectedIntegrationType, setSelectedIntegrationType] = useState('GA4');
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [clarityMapModalOpen, setClarityMapModalOpen] = useState(false);
  const [claritySyncModalOpen, setClaritySyncModalOpen] = useState(false);

  const { data: websiteData, isLoading } = useGetWebsiteQuery(
    { workspaceId: workspace?.id, websiteId },
    { skip: !workspace?.id || !websiteId }
  );

  const { data: integrationsData, isLoading: isLoadingIntegrations, refetch: refetchIntegrations } =
    useGetWebsiteIntegrationsQuery(
      { workspaceId: workspace?.id, websiteId },
      { skip: !workspace?.id || !websiteId }
    );

  const [disconnectProperty, { isLoading: isDisconnecting }] =
    useDisconnectWebsitePropertyMutation();

  const [unmapClarity, { isLoading: isUnmappingClarity }] =
    useUnmapWebsiteFromClarityMutation();

  const website = websiteData?.data;
  const integrations = integrationsData?.data || [];
  const clarityConn = integrations.find((i) => i.integrationType === 'CLARITY');

  useEffect(() => {
    const requestedSync = searchParams.get('sync');
    if (!requestedSync || isLoadingIntegrations) return;
    const normalized = requestedSync.toUpperCase();
    if (normalized === 'GA4' || normalized === 'GSC') {
      const connection = integrations.find((item) => item.integrationType === normalized);
      if (connection?.selectedProperty && connection.status !== 'NOT_CONNECTED') {
        handleOpenSync(normalized);
      }
    } else if (normalized === 'CLARITY' && clarityConn?.selectedProperty && clarityConn.status === 'CONNECTED') {
      setClaritySyncModalOpen(true);
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, isLoadingIntegrations, integrations, clarityConn]);

  const handleOpenConnect = (type) => {
    setSelectedIntegrationType(type);
    setPropertyModalOpen(true);
  };

  const handleOpenSync = (type) => {
    setSelectedIntegrationType(type);
    setSyncModalOpen(true);
  };

  const handleDisconnect = async (type) => {
    if (confirm(`Are you sure you want to disconnect ${type} from this website?`)) {
      try {
        await disconnectProperty({
          workspaceId: workspace?.id,
          websiteId,
          integrationType: type,
        }).unwrap();
      } catch (err) {
        alert(`Disconnect failed: ${err?.data?.message || err.message}`);
      }
    }
  };

  const handleDisconnectClarity = async () => {
    if (
      confirm(
        'Are you sure you want to unlink Microsoft Clarity from this website? Historical imported snapshots and metrics will remain preserved.'
      )
    ) {
      try {
        await unmapClarity({
          workspaceId: workspace?.id,
          websiteId,
        }).unwrap();
      } catch (err) {
        alert(`Unlink failed: ${err?.data?.message || err.message}`);
      }
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-sm text-surface-400">Loading website details…</div>;
  }

  if (!website) {
    return (
      <div className="card p-8 text-center max-w-lg mx-auto">
        <h3 className="text-base font-semibold text-surface-900">Website Not Found</h3>
        <p className="text-sm text-surface-500 mt-1 mb-4">
          The requested website record does not exist or you lack authorization.
        </p>
        <Link to="/websites" className="btn-primary">
          Back to Websites
        </Link>
      </div>
    );
  }

  const ga4Conn = integrations.find((i) => i.integrationType === 'GA4');
  const gscConn = integrations.find((i) => i.integrationType === 'GSC');
  const ga4IsMapped = Boolean(ga4Conn?.selectedProperty && ga4Conn.status !== 'NOT_CONNECTED');
  const gscIsMapped = Boolean(gscConn?.selectedProperty && gscConn.status !== 'NOT_CONNECTED');

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          to="/websites"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-surface-500 hover:text-surface-800"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Websites
        </Link>
        <StatusBadge status={website.status} />
      </div>

      {/* Website Header Card */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center border border-brand-200">
              <Globe className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-surface-900 tracking-tight">{website.domain}</h1>
              <div className="flex items-center gap-3 text-xs text-surface-400 mt-1">
                <span>{website.name}</span>
                <span>•</span>
                <Link
                  to={`/clients/${website.client.id}`}
                  className="text-brand-600 font-medium hover:underline flex items-center gap-1"
                >
                  <Building2 className="w-3 h-3" />
                  {website.client.name}
                </Link>
              </div>
            </div>
          </div>

          {website.url && (
            <a
              href={website.url}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
            >
              <span>Visit URL</span>
              <ExternalLink className="w-3.5 h-3.5 text-surface-400" />
            </a>
          )}
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="border-b border-surface-200 flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-none whitespace-nowrap pb-px">
        <button
          onClick={() => setActiveMainTab('integrations')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeMainTab === 'integrations'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-surface-500 hover:text-surface-800'
          }`}
        >
          <Plug className="w-4 h-4" />
          <span>Analytics Integrations</span>
        </button>

        <button
          onClick={() => setActiveMainTab('analytics')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeMainTab === 'analytics'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-surface-500 hover:text-surface-800'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Stored SEO Intelligence (Offline)</span>
        </button>

        <button
          onClick={() => setActiveMainTab('clarity')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeMainTab === 'clarity'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-surface-500 hover:text-surface-800'
          }`}
        >
          <MousePointer className="w-4 h-4" />
          <span>Behavioral Analytics (Clarity)</span>
        </button>

        <button
          onClick={() => setActiveMainTab('sync')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 flex-shrink-0 ${
            activeMainTab === 'sync'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-surface-500 hover:text-surface-800'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>Background Sync & Queues</span>
        </button>
      </div>

      {/* TAB 1: INTEGRATIONS */}
      {activeMainTab === 'integrations' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Metadata */}
          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-surface-900">Website Configuration</h3>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs text-surface-400 block">Domain</span>
                <span className="font-medium text-surface-800">{website.domain}</span>
              </div>
              <div>
                <span className="text-xs text-surface-400 block">Canonical URL</span>
                <span className="font-medium text-surface-800">{website.url || 'None specified'}</span>
              </div>
              <div>
                <span className="text-xs text-surface-400 block">Timezone</span>
                <span className="font-medium text-surface-800">{website.timezone || 'UTC'}</span>
              </div>
              <div>
                <span className="text-xs text-surface-400 block">Registered On</span>
                <span className="font-medium text-surface-800">
                  {new Date(website.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-surface-100">
              <span className="text-xs text-surface-400 block mb-1">Description</span>
              <p className="text-xs text-surface-600">
                {website.description || 'No description provided.'}
              </p>
            </div>
          </div>

          {/* Right: Connected Analytics Services */}
          <div className="card p-5 md:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-surface-900">Connected SEO Platforms</h3>
                <p className="text-xs text-surface-500">
                  Map Google Analytics 4 and Search Console resources to collect historical metrics locally.
                </p>
              </div>
              <button
                onClick={() => refetchIntegrations()}
                className="text-xs text-surface-500 hover:text-surface-800 flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>

            <div className="space-y-4">
              {/* GA4 CARD */}
              <div className="p-4 rounded-xl border border-surface-200 bg-surface-50/50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-surface-900">Google Analytics 4</span>
                    <span className="text-2xs bg-surface-200 text-surface-700 px-1.5 py-0.5 rounded font-mono">
                      GA4
                    </span>
                    <span
                      className={`text-2xs px-2 py-0.5 rounded-full font-semibold ${
                        ga4IsMapped && ga4Conn.status !== 'FAILED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : ga4Conn?.status === 'FAILED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-surface-200 text-surface-600'
                      }`}
                    >
                      {ga4Conn?.status || 'NOT_CONNECTED'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {ga4IsMapped ? (
                      <>
                        <button
                          onClick={() => handleOpenSync('GA4')}
                          className="btn-secondary btn-sm inline-flex items-center gap-1 text-xs"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Import Data</span>
                        </button>
                        <button
                          onClick={() => handleOpenConnect('GA4')}
                          className="btn-secondary btn-sm text-xs"
                        >
                          Change
                        </button>
                        <button
                          onClick={() => handleDisconnect('GA4')}
                          className="text-xs text-rose-600 hover:underline p-1"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleOpenConnect('GA4')}
                        className="btn-primary btn-sm inline-flex items-center gap-1.5 text-xs"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Connect GA4</span>
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-surface-500">
                  User acquisition, session engagement, bounce rates, conversions, and traffic channels.
                </p>

                {ga4IsMapped && (
                  <div className="p-2.5 rounded-lg bg-surface-100 text-xs text-surface-700 flex flex-wrap items-center gap-4">
                    <div>
                      Account: <strong>{ga4Conn.googleAccount?.email || 'Connected Account'}</strong>
                    </div>
                    <div>
                      Property: <strong>{ga4Conn.selectedPropertyName || ga4Conn.selectedProperty}</strong>
                    </div>
                    {ga4Conn.lastSyncAt && (
                      <div className="text-surface-500">
                        Last synced: {new Date(ga4Conn.lastSyncAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* GSC CARD */}
              <div className="p-4 rounded-xl border border-surface-200 bg-surface-50/50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-surface-900">Google Search Console</span>
                    <span className="text-2xs bg-surface-200 text-surface-700 px-1.5 py-0.5 rounded font-mono">
                      GSC
                    </span>
                    <span
                      className={`text-2xs px-2 py-0.5 rounded-full font-semibold ${
                        gscIsMapped && gscConn.status !== 'FAILED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : gscConn?.status === 'FAILED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-surface-200 text-surface-600'
                      }`}
                    >
                      {gscConn?.status || 'NOT_CONNECTED'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {gscIsMapped ? (
                      <>
                        <button
                          onClick={() => handleOpenSync('GSC')}
                          className="btn-secondary btn-sm inline-flex items-center gap-1 text-xs"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Import Data</span>
                        </button>
                        <button
                          onClick={() => handleOpenConnect('GSC')}
                          className="btn-secondary btn-sm text-xs"
                        >
                          Change
                        </button>
                        <button
                          onClick={() => handleDisconnect('GSC')}
                          className="text-xs text-rose-600 hover:underline p-1"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleOpenConnect('GSC')}
                        className="btn-primary btn-sm inline-flex items-center gap-1.5 text-xs"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Connect GSC</span>
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-surface-500">
                  Organic search queries, keyword clicks, impressions, CTR, and average SERP rankings.
                </p>

                {gscIsMapped && (
                  <div className="p-2.5 rounded-lg bg-surface-100 text-xs text-surface-700 flex flex-wrap items-center gap-4">
                    <div>
                      Account: <strong>{gscConn.googleAccount?.email || 'Connected Account'}</strong>
                    </div>
                    <div>
                      Site Property: <strong>{gscConn.selectedPropertyName || gscConn.selectedProperty}</strong>
                    </div>
                    {gscConn.lastSyncAt && (
                      <div className="text-surface-500">
                        Last synced: {new Date(gscConn.lastSyncAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Microsoft Clarity Card */}
              <div className="p-4 rounded-xl border border-surface-200 bg-surface-50/50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-surface-900">Microsoft Clarity</span>
                    <span className="text-2xs bg-surface-200 text-surface-700 px-1.5 py-0.5 rounded font-mono">
                      CLARITY
                    </span>
                    <span
                      className={`text-2xs px-2 py-0.5 rounded-full font-semibold ${
                        clarityConn?.status === 'CONNECTED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-surface-200 text-surface-600'
                      }`}
                    >
                      {clarityConn?.status || 'NOT_CONNECTED'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {clarityConn?.status === 'CONNECTED' ? (
                      <>
                        <button
                          onClick={() => setClaritySyncModalOpen(true)}
                          className="btn-secondary btn-sm inline-flex items-center gap-1 text-xs"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Import Data</span>
                        </button>
                        <button
                          onClick={() => setClarityMapModalOpen(true)}
                          className="btn-secondary btn-sm text-xs"
                        >
                          Change
                        </button>
                        <button
                          onClick={handleDisconnectClarity}
                          className="text-xs text-rose-600 hover:underline p-1"
                          title="Unlink Microsoft Clarity"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setClarityMapModalOpen(true)}
                        className="btn-primary btn-sm inline-flex items-center gap-1.5 text-xs"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Connect Clarity</span>
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-surface-500">
                  Dead clicks, rage clicks, quickbacks, scroll depth, and user interaction friction analytics.
                </p>

                {clarityConn?.status === 'CONNECTED' && (
                  <div className="p-2.5 rounded-lg bg-surface-100 text-xs text-surface-700 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <div>
                        Project: <strong>{clarityConn.selectedPropertyName || clarityConn.selectedProperty}</strong>
                      </div>
                      <div>
                        Project ID: <span className="font-mono text-surface-600">{clarityConn.selectedProperty}</span>
                      </div>
                      {clarityConn.lastSyncAt && (
                        <div className="text-surface-500">
                          Last synced: {new Date(clarityConn.lastSyncAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setActiveMainTab('clarity')}
                      className="text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1 text-xs"
                    >
                      <MousePointer className="w-3 h-3" />
                      <span>View Behavioral Analytics &rarr;</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Bing Webmaster Tools Card */}
              <BingIntegrationCard workspaceId={workspace?.id} websiteId={websiteId} websiteDomain={website?.domain} />
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STORED SEO PERFORMANCE DATA */}
      {activeMainTab === 'analytics' && (
        <WebsiteAnalyticsDashboard
          workspaceId={workspace?.id}
          websiteId={websiteId}
          website={website}
        />
      )}

      {/* TAB 3: STORED CLARITY BEHAVIORAL ANALYTICS */}
      {activeMainTab === 'clarity' && (
        <ClarityMetricsView workspaceId={workspace?.id} websiteId={websiteId} />
      )}

      {/* TAB 4: BACKGROUND SYNC & QUEUES (Phase 5) */}
      {activeMainTab === 'sync' && (
        <SyncManagementView workspaceId={workspace?.id} websiteId={websiteId} />
      )}

      {/* Property Selector Modal */}
      <PropertySelectModal
        isOpen={propertyModalOpen}
        onClose={() => setPropertyModalOpen(false)}
        workspaceId={workspace?.id}
        website={website}
        integrationType={selectedIntegrationType}
      />

      {/* Manual Data Import Modal (GA4 / GSC) */}
      <ManualSyncModal
        isOpen={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        workspaceId={workspace?.id}
        websiteId={websiteId}
        integrationType={selectedIntegrationType}
      />

      {/* Clarity Mapping Modal */}
      <ClarityMapModal
        isOpen={clarityMapModalOpen}
        onClose={() => setClarityMapModalOpen(false)}
        workspaceId={workspace?.id}
        website={website}
      />

      {/* Clarity Data Import Modal */}
      <ClaritySyncModal
        isOpen={claritySyncModalOpen}
        onClose={() => setClaritySyncModalOpen(false)}
        workspaceId={workspace?.id}
        websiteId={websiteId}
        clarityConnection={clarityConn?.clarityConnection}
      />
    </div>
  );
}
