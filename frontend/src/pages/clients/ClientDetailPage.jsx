// frontend/src/pages/clients/ClientDetailPage.jsx
import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectActiveWorkspace } from '../../features/auth/authSlice.js';
import {
  useGetClientQuery,
  useAssignClientMemberMutation,
  useRemoveClientMemberMutation,
} from '../../features/clients/clientsApi.js';
import { useGetMembersQuery } from '../../features/members/membersApi.js';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import Modal from '../../components/common/Modal.jsx';
import {
  Building2,
  Globe,
  Users,
  BarChart3,
  ExternalLink,
  Plus,
  Mail,
  UserX,
  ArrowLeft,
} from 'lucide-react';
import AgencyOverviewTable from '../../features/analytics/components/AgencyOverviewTable.jsx';

export default function ClientDetailPage() {
  const { clientId } = useParams();
  const workspace = useSelector(selectActiveWorkspace);

  const [activeTab, setActiveTab] = useState('overview');
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');

  const { data: clientData, isLoading } = useGetClientQuery(
    { workspaceId: workspace?.id, clientId },
    { skip: !workspace?.id || !clientId }
  );

  const { data: membersData } = useGetMembersQuery(workspace?.id, {
    skip: !workspace?.id,
  });

  const [assignMember, { isLoading: isAssigning }] = useAssignClientMemberMutation();
  const [removeMember] = useRemoveClientMemberMutation();

  const client = clientData?.data;
  const workspaceMembers = membersData?.data || [];

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!selectedUserId) return;
    try {
      await assignMember({
        workspaceId: workspace.id,
        clientId,
        userId: selectedUserId,
      }).unwrap();
      setIsAssignModalOpen(false);
      setSelectedUserId('');
    } catch (err) {
      console.error('Assignment error:', err);
    }
  };

  const handleUnassign = async (userId) => {
    if (window.confirm('Remove this member from the client account?')) {
      await removeMember({
        workspaceId: workspace.id,
        clientId,
        userId,
      });
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-sm text-surface-400">Loading client profile…</div>;
  }

  if (!client) {
    return (
      <div className="card p-8 text-center max-w-lg mx-auto">
        <h3 className="text-base font-semibold text-surface-900">Client Not Found</h3>
        <p className="text-sm text-surface-500 mt-1 mb-4">
          The requested client record does not exist or you lack permission.
        </p>
        <Link to="/clients" className="btn-primary">
          Back to Clients
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between">
        <Link to="/clients" className="inline-flex items-center gap-1.5 text-xs font-medium text-surface-500 hover:text-surface-800">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Clients
        </Link>
        <StatusBadge status={client.status} />
      </div>

      {/* Client Header Card */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-2xl border border-brand-200">
              {client.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-surface-900 tracking-tight">{client.name}</h1>
              <div className="flex items-center gap-3 text-xs text-surface-400 mt-1">
                <span>{client.companyName || 'No corporate name'}</span>
                <span>•</span>
                <span>Created {new Date(client.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {client.website && (
            <a
              href={client.website}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
            >
              <Globe className="w-4 h-4 text-surface-500" />
              <span>Visit Website</span>
              <ExternalLink className="w-3 h-3 text-surface-400" />
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-surface-200">
        <nav className="flex space-x-8">
          {[
            { id: 'overview', label: 'Overview', icon: Building2 },
            { id: 'websites', label: `Websites (${client.websites?.length || 0})`, icon: Globe },
            { id: 'team', label: `Team Members (${client.assignedMembers?.length || 0})`, icon: Users },
            { id: 'seo', label: 'SEO Intelligence', icon: BarChart3, badge: 'Phase 6' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                  isActive
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="text-2xs bg-surface-100 text-surface-500 px-1.5 py-0.5 rounded font-normal">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card p-5 md:col-span-2 space-y-4">
            <h3 className="text-sm font-semibold text-surface-900">Client Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs text-surface-400 block">Primary Contact</span>
                <span className="font-medium text-surface-800">{client.contactName || 'Not specified'}</span>
              </div>
              <div>
                <span className="text-xs text-surface-400 block">Contact Email</span>
                <span className="font-medium text-surface-800">{client.contactEmail || 'Not specified'}</span>
              </div>
              <div>
                <span className="text-xs text-surface-400 block">Contact Phone</span>
                <span className="font-medium text-surface-800">{client.contactPhone || 'Not specified'}</span>
              </div>
              <div>
                <span className="text-xs text-surface-400 block">Timezone</span>
                <span className="font-medium text-surface-800">{client.timezone || 'UTC'}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-surface-100">
              <span className="text-xs text-surface-400 block mb-1">Internal Notes</span>
              <p className="text-sm text-surface-700 whitespace-pre-wrap">
                {client.notes || 'No agency notes recorded for this client.'}
              </p>
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-surface-900">Summary Statistics</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-surface-500">Tracked Domains</span>
                <span className="font-semibold text-surface-900">{client.websites?.length || 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-surface-500">Assigned Specialists</span>
                <span className="font-semibold text-surface-900">{client.assignedMembers?.length || 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-surface-500">Status</span>
                <StatusBadge status={client.status} />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'websites' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-semibold text-surface-900">Client Websites</h3>
            <Link to={`/websites?clientId=${clientId}`} className="btn-primary btn-sm">
              <Plus className="w-3.5 h-3.5" />
              Add Website
            </Link>
          </div>

          {client.websites?.length === 0 ? (
            <div className="card p-8 text-center text-surface-400 text-sm">
              No websites registered under this client yet.
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="table">
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {client.websites.map((ws) => (
                    <tr key={ws.id}>
                      <td className="font-medium text-surface-900">{ws.domain}</td>
                      <td>{ws.name}</td>
                      <td>
                        <StatusBadge status={ws.status} />
                      </td>
                      <td className="text-xs text-surface-400">
                        {new Date(ws.createdAt).toLocaleDateString()}
                      </td>
                      <td className="text-right">
                        <Link to={`/websites/${ws.id}`} className="btn-ghost btn-sm">
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'team' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-semibold text-surface-900">Assigned Team Members</h3>
            <button onClick={() => setIsAssignModalOpen(true)} className="btn-primary btn-sm">
              <Plus className="w-3.5 h-3.5" />
              Assign Member
            </button>
          </div>

          {client.assignedMembers?.length === 0 ? (
            <div className="card p-8 text-center text-surface-400 text-sm">
              No SEO team members assigned to this client yet. Only Super Admins and Admins can view it currently.
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Email</th>
                    <th>Assigned Date</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {client.assignedMembers.map((am) => (
                    <tr key={am.id}>
                      <td className="font-semibold text-surface-900">{am.user.name}</td>
                      <td className="text-surface-600">{am.user.email}</td>
                      <td className="text-xs text-surface-400">
                        {new Date(am.assignedAt).toLocaleDateString()}
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => handleUnassign(am.user.id)}
                          className="text-danger-500 hover:text-danger-700 text-xs font-medium inline-flex items-center gap-1"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          Unassign
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'seo' && (
        <AgencyOverviewTable workspaceId={workspace?.id} filterClientId={clientId} />
      )}

      {/* Assign Member Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Assign Team Member to Client"
      >
        <form onSubmit={handleAssign} className="space-y-4">
          <div>
            <label className="label">Select Team Member</label>
            <select
              className="input"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              required
            >
              <option value="">Choose an agency member…</option>
              {workspaceMembers
                .filter((m) => !client.assignedMembers.some((am) => am.user.id === m.userId))
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name} ({m.email}) — {m.role?.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
            <button
              type="button"
              onClick={() => setIsAssignModalOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={isAssigning || !selectedUserId} className="btn-primary">
              {isAssigning ? 'Assigning…' : 'Assign to Client'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
