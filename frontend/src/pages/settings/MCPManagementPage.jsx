// frontend/src/pages/settings/MCPManagementPage.jsx
// Administrator MCP Management Dashboard: tokens, connection configuration, tools catalog, and execution logs.

import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { selectActiveWorkspace } from '../../features/auth/authSlice.js';
import {
  useGetMcpStatusQuery,
  useGetMcpCatalogQuery,
  useGetMcpTokensQuery,
  useCreateMcpTokenMutation,
  useRevokeMcpTokenMutation,
  useGetMcpLogsQuery,
} from '../../features/mcp/mcpApi.js';
import {
  Terminal,
  Key,
  Shield,
  Copy,
  Check,
  Plus,
  Trash2,
  Clock,
  Layers,
  FileCode,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Code2,
} from 'lucide-react';

export default function MCPManagementPage() {
  const activeWorkspace = useSelector(selectActiveWorkspace);
  const workspaceId = activeWorkspace?.id;

  const [activeTab, setActiveTab] = useState('tokens');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [clientName, setClientName] = useState('Claude Desktop Client');
  const [transportType, setTransportType] = useState('STREAMABLE_HTTP');
  const [generatedToken, setGeneratedToken] = useState(null);
  const [copiedKey, setCopiedKey] = useState('');

  // Queries
  const { data: statusRes, isLoading: isStatusLoading } = useGetMcpStatusQuery(workspaceId, {
    skip: !workspaceId,
  });
  const status = statusRes?.data;

  const { data: catalogRes, isLoading: isCatalogLoading } = useGetMcpCatalogQuery(workspaceId, {
    skip: !workspaceId,
  });
  const catalog = catalogRes?.data || { tools: [], resources: [], prompts: [] };

  const { data: tokensRes, isLoading: isTokensLoading } = useGetMcpTokensQuery(workspaceId, {
    skip: !workspaceId,
  });
  const tokens = tokensRes?.data || [];

  const { data: logsRes, isLoading: isLogsLoading } = useGetMcpLogsQuery(
    { workspaceId, limit: 30 },
    { skip: !workspaceId }
  );
  const logs = logsRes?.data?.logs || [];

  // Mutations
  const [createToken, { isLoading: isCreatingToken }] = useCreateMcpTokenMutation();
  const [revokeToken] = useRevokeMcpTokenMutation();

  const copyToClipboard = (text, key) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2500);
  };

  const handleGenerateToken = async (e) => {
    e.preventDefault();
    if (!workspaceId) return;

    try {
      const res = await createToken({
        workspaceId,
        clientName,
        transport: transportType,
      }).unwrap();

      setGeneratedToken(res.data?.rawToken);
    } catch (err) {
      alert('Failed to generate token: ' + (err.data?.message || err.message));
    }
  };

  const handleRevokeToken = async (tokenId) => {
    if (!window.confirm('Are you sure you want to revoke this MCP access token? Connected clients will lose access immediately.')) {
      return;
    }
    try {
      await revokeToken({ workspaceId, tokenId }).unwrap();
    } catch (err) {
      alert('Failed to revoke token: ' + (err.data?.message || err.message));
    }
  };

  const filteredTools = selectedGroup === 'ALL'
    ? catalog.tools
    : catalog.tools.filter(t => t.group === selectedGroup);

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        missiveSEO: {
          command: 'npm',
          args: [
            '--prefix',
            'C:/path/to/missive-seo-intelligence/backend',
            'run',
            'mcp:stdio',
          ],
          env: {
            MCP_WORKSPACE_ID: workspaceId || 'your-workspace-id',
          },
        },
      },
    },
    null,
    2
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Page Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-brand-50 border border-brand-200 text-brand-600 rounded-lg">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-surface-900 tracking-tight">Model Context Protocol (MCP) Server</h1>
              <p className="text-xs text-surface-500">
                Official MCP server providing standardized tools, resources, and prompts to compatible AI clients.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Server Active (Official SDK v1.32)</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setGeneratedToken(null);
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Generate Access Token</span>
          </button>
        </div>
      </div>

      {/* Server Status KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-white border border-surface-200 rounded-xl shadow-2xs">
          <span className="text-2xs font-semibold text-surface-400 uppercase tracking-wider block">Server Status</span>
          <span className="text-lg font-bold text-emerald-600 mt-1 block">Online (Stateless)</span>
          <span className="text-3xs text-surface-400 mt-0.5 block">Streamable HTTP + STDIO</span>
        </div>
        <div className="p-4 bg-white border border-surface-200 rounded-xl shadow-2xs">
          <span className="text-2xs font-semibold text-surface-400 uppercase tracking-wider block">Tools Registered</span>
          <span className="text-lg font-bold text-surface-900 mt-1 block">{status?.toolsCount || 20} Tools</span>
          <span className="text-3xs text-surface-400 mt-0.5 block">Across 6 Specialized Groups</span>
        </div>
        <div className="p-4 bg-white border border-surface-200 rounded-xl shadow-2xs">
          <span className="text-2xs font-semibold text-surface-400 uppercase tracking-wider block">Active Tokens</span>
          <span className="text-lg font-bold text-brand-600 mt-1 block">{status?.metrics?.activeTokensCount || 0}</span>
          <span className="text-3xs text-surface-400 mt-0.5 block">Revocable Client Credentials</span>
        </div>
        <div className="p-4 bg-white border border-surface-200 rounded-xl shadow-2xs">
          <span className="text-2xs font-semibold text-surface-400 uppercase tracking-wider block">Execution Logs</span>
          <span className="text-lg font-bold text-surface-900 mt-1 block">{status?.metrics?.recentLogsCount || 0}</span>
          <span className="text-3xs text-surface-400 mt-0.5 block">Audited Tool Calls</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-surface-200 mb-6">
        <nav className="flex space-x-6">
          <button
            type="button"
            onClick={() => setActiveTab('tokens')}
            className={`pb-3 text-xs font-semibold transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'tokens'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Access Tokens</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`pb-3 text-xs font-semibold transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'catalog'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Tools & Capabilities ({catalog.tools.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`pb-3 text-xs font-semibold transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'guide'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Client Connection Guide</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`pb-3 text-xs font-semibold transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'logs'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-surface-500 hover:text-surface-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Execution Audit Logs</span>
          </button>
        </nav>
      </div>

      {/* TAB 1: Access Tokens */}
      {activeTab === 'tokens' && (
        <div className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-surface-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-surface-900">Provisioned MCP Access Tokens</h2>
              <p className="text-xs text-surface-500 mt-0.5">
                Revocable tokens dedicated to external MCP clients (Claude Desktop, Cursor, and autonomous agents).
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-200 text-xs text-left">
              <thead className="bg-surface-50 text-surface-500 font-semibold uppercase tracking-wider text-2xs">
                <tr>
                  <th className="px-4 py-3">Client Profile</th>
                  <th className="px-4 py-3">Transport</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created At</th>
                  <th className="px-4 py-3">Last Used</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 text-surface-700">
                {isTokensLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-surface-400">Loading tokens...</td>
                  </tr>
                ) : tokens.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-surface-400">
                      No MCP tokens created yet. Click "Generate Access Token" to connect your first client.
                    </td>
                  </tr>
                ) : (
                  tokens.map((tok) => (
                    <tr key={tok.id} className="hover:bg-surface-50/70">
                      <td className="px-4 py-3 font-semibold text-surface-900">{tok.clientName}</td>
                      <td className="px-4 py-3 font-mono text-2xs text-surface-600">{tok.transport}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-3xs font-semibold ${
                            tok.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {tok.isActive ? 'Active' : 'Revoked'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{new Date(tok.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">{tok.lastUsedAt ? new Date(tok.lastUsedAt).toLocaleString() : 'Never'}</td>
                      <td className="px-4 py-3 text-right">
                        {tok.isActive && (
                          <button
                            type="button"
                            onClick={() => handleRevokeToken(tok.id)}
                            className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Tools & Capabilities */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {['ALL', 'WEBSITE', 'GA4', 'GSC', 'CLARITY', 'SEO_ANALYSIS', 'COMPARISON'].map((grp) => (
              <button
                key={grp}
                type="button"
                onClick={() => setSelectedGroup(grp)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  selectedGroup === grp
                    ? 'bg-brand-600 text-white'
                    : 'bg-white border border-surface-200 text-surface-600 hover:bg-surface-50'
                }`}
              >
                {grp.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredTools.map((tool) => (
              <div key={tool.name} className="p-4 bg-white border border-surface-200 rounded-xl shadow-2xs hover:border-brand-300 transition-colors">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-mono text-xs font-bold text-brand-700">{tool.name}</span>
                  <span className="px-2 py-0.5 rounded text-3xs font-semibold bg-surface-100 text-surface-600 uppercase">
                    {tool.group}
                  </span>
                </div>
                <p className="text-xs text-surface-600">{tool.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Client Connection Guide */}
      {activeTab === 'guide' && (
        <div className="bg-white border border-surface-200 rounded-xl p-6 shadow-2xs space-y-6">
          <div>
            <h2 className="text-base font-bold text-surface-900 mb-1">Connecting Compatible MCP Clients</h2>
            <p className="text-xs text-surface-500">
              Compatible clients such as Claude Desktop, Cursor, and autonomous agents connect to this MCP server via Streamable HTTP or local STDIO.
            </p>
          </div>

          {/* Option A: Claude Desktop STDIO */}
          <div className="p-4 bg-surface-50 border border-surface-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-surface-900">A. Claude Desktop (Local STDIO Transport)</span>
              <button
                type="button"
                onClick={() => copyToClipboard(claudeDesktopConfig, 'claude')}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-semibold"
              >
                {copiedKey === 'claude' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'claude' ? 'Copied' : 'Copy JSON'}</span>
              </button>
            </div>
            <p className="text-xs text-surface-500 mb-2">
              Replace the sample backend path with your project folder, then add this block to <code className="text-3xs bg-surface-200 px-1 py-0.5 rounded font-mono">claude_desktop_config.json</code>. The STDIO process reads database and encryption settings from <code>backend/.env</code>; no MCP token is needed for this local transport.
            </p>
            <pre className="p-3 bg-surface-900 text-surface-100 font-mono text-xs rounded overflow-x-auto">
              {claudeDesktopConfig}
            </pre>
          </div>

          {/* Option B: Streamable HTTP */}
          <div className="p-4 bg-surface-50 border border-surface-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-surface-900">B. Remote Streamable HTTP Transport (Production)</span>
            </div>
            <p className="text-xs text-surface-600 mb-2">
              HTTP clients use the endpoint and bearer token below. Generate a token with the Streamable HTTP transport selected; keep the token private.
            </p>
            <div className="p-3 bg-surface-900 text-surface-100 font-mono text-xs rounded space-y-1">
              <p><span className="text-brand-300">POST</span> {typeof window !== 'undefined' ? `${window.location.origin}/api/v1/mcp` : '/api/v1/mcp'}</p>
              <p><span className="text-surface-400">Header:</span> Authorization: Bearer {generatedToken || 'mcp_live_...'}</p>
              <p><span className="text-surface-400">Header:</span> Content-Type: application/json</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Execution Audit Logs */}
      {activeTab === 'logs' && (
        <div className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-surface-100">
            <h2 className="text-sm font-bold text-surface-900">Recent MCP Tool Calls</h2>
            <p className="text-xs text-surface-500">Security audit trail of every MCP invocation.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-200 text-xs text-left">
              <thead className="bg-surface-50 text-surface-500 font-semibold uppercase tracking-wider text-2xs">
                <tr>
                  <th className="px-4 py-3">Tool Name</th>
                  <th className="px-4 py-3">Client Profile</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100 text-surface-700">
                {isLogsLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-surface-400">Loading audit logs...</td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-surface-400">No tool executions recorded yet.</td>
                  </tr>
                ) : (
                  logs.map((lg) => (
                    <tr key={lg.id} className="hover:bg-surface-50/70">
                      <td className="px-4 py-3 font-mono font-semibold text-brand-700">{lg.toolName}</td>
                      <td className="px-4 py-3">{lg.mcpClient?.name || 'MCP Client'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-3xs font-semibold ${
                            lg.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {lg.success ? 'Success' : 'Failed'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{lg.durationMs ? `${lg.durationMs}ms` : 'N/A'}</td>
                      <td className="px-4 py-3">{new Date(lg.executedAt).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Token Generation Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/60 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-surface-200">
            <h3 className="text-base font-bold text-surface-900 mb-2">Generate Dedicated MCP Token</h3>

            {generatedToken ? (
              <div className="space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs">
                  <p className="font-semibold mb-1">Make sure to copy your access token now!</p>
                  <p className="text-3xs">For security reasons, this token cannot be displayed again.</p>
                </div>

                <div className="flex items-center gap-2 p-2.5 bg-surface-50 border border-surface-200 rounded font-mono text-xs break-all">
                  <span className="flex-1">{generatedToken}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedToken, 'modal-tok')}
                    className="p-1.5 text-brand-600 hover:text-brand-800"
                    title="Copy token"
                  >
                    {copiedKey === 'modal-tok' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="w-full py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleGenerateToken} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-surface-700 mb-1">Client Profile Name</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-xs"
                    placeholder="e.g. Claude Desktop Agent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-surface-700 mb-1">Transport Type</label>
                  <select
                    value={transportType}
                    onChange={(e) => setTransportType(e.target.value)}
                    className="w-full px-3 py-2 border border-surface-200 rounded-lg text-xs bg-white"
                  >
                    <option value="STREAMABLE_HTTP">Streamable HTTP (Remote / Web)</option>
                    <option value="STDIO">STDIO (Local Subprocess / CLI)</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-3 py-1.5 border border-surface-200 text-surface-600 rounded-lg text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingToken}
                    className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    {isCreatingToken ? 'Generating...' : 'Generate Token'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
