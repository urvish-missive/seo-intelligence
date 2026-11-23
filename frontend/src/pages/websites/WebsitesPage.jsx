// frontend/src/pages/websites/WebsitesPage.jsx
import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { selectActiveWorkspace, selectUserPermissions } from '../../features/auth/authSlice.js';
import {
  useGetWebsitesQuery,
  useCreateWebsiteMutation,
  useArchiveWebsiteMutation,
  useDeleteWebsiteMutation,
} from '../../features/websites/websitesApi.js';
import { useGetClientsQuery } from '../../features/clients/clientsApi.js';
import Modal from '../../components/common/Modal.jsx';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import {
  Globe,
  Plus,
  Search,
  Filter,
  Archive,
  Trash2,
  ExternalLink,
  Building2,
  CheckCircle2,
  Clock,
} from 'lucide-react';

const normalizeDomain = (input) => {
  if (!input) return '';
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//i, '');
  domain = domain.replace(/^www\./i, '');
  domain = domain.split('/')[0].split('?')[0].split('#')[0];
  return domain;
};

const websiteSchema = z.object({
  clientId: z.string().min(1, 'Please select a client'),
  name: z.string().trim().min(2, 'Website name must be at least 2 characters'),
  domain: z
    .string()
    .trim()
    .min(3, 'Domain must be at least 3 characters')
    .transform(normalizeDomain)
    .refine((d) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(d), {
      message: 'Invalid domain format (e.g. example.com or app.example.com)',
    }),
  url: z.string().trim().optional().or(z.literal('')),
  description: z.string().max(1000).optional(),
});

export default function WebsitesPage() {
  const [searchParams] = useSearchParams();
  const preselectedClientId = searchParams.get('clientId') || '';

  const workspace = useSelector(selectActiveWorkspace);
  const permissions = useSelector(selectUserPermissions);

  const [search, setSearch] = useState('');
  const [selectedClientFilter, setSelectedClientFilter] = useState(preselectedClientId);
  const [statusFilter, setStatusFilter] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data: clientsData } = useGetClientsQuery(
    { workspaceId: workspace?.id, limit: 100 },
    { skip: !workspace?.id }
  );

  const { data: websitesData, isLoading } = useGetWebsitesQuery(
    {
      workspaceId: workspace?.id,
      clientId: selectedClientFilter || undefined,
      status: statusFilter || undefined,
      search: search || undefined,
    },
    { skip: !workspace?.id }
  );

  const [createWebsite, { isLoading: isCreating }] = useCreateWebsiteMutation();
  const [archiveWebsite] = useArchiveWebsiteMutation();
  const [deleteWebsite] = useDeleteWebsiteMutation();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(websiteSchema),
    defaultValues: {
      clientId: preselectedClientId,
    },
  });

  const handleCreate = async (formData) => {
    try {
      const cleanDomain = normalizeDomain(formData.domain);
      const canonicalUrl = formData.url?.trim()
        ? (formData.url.startsWith('http') ? formData.url : `https://${formData.url}`)
        : `https://${cleanDomain}`;

      await createWebsite({
        workspaceId: workspace.id,
        clientId: formData.clientId,
        name: formData.name,
        domain: cleanDomain,
        url: canonicalUrl,
        description: formData.description,
      }).unwrap();
      setIsAddOpen(false);
      reset();
    } catch (err) {
      console.error('Failed to register website:', err);
      alert(err?.data?.message || 'Failed to register website');
    }
  };

  const handleArchive = async (websiteId) => {
    if (window.confirm('Toggle archive status for this website?')) {
      await archiveWebsite({ workspaceId: workspace.id, websiteId });
    }
  };

  const handleDelete = async (websiteId, domain) => {
    if (window.confirm(`Permanently remove website "${domain}"?`)) {
      await deleteWebsite({ workspaceId: workspace.id, websiteId });
    }
  };

  const websites = websitesData?.data || [];
  const clients = clientsData?.data || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Websites</h1>
          <p className="text-sm text-surface-500 mt-1">
            Track and manage digital properties across all agency client accounts.
          </p>
        </div>
        {permissions.includes('websites.create') && (
          <button onClick={() => setIsAddOpen(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            <span>Add Website</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-surface-400 absolute left-3 top-3" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Search domain or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-surface-400" />
          <select
            className="input py-1.5 text-xs w-full sm:w-44"
            value={selectedClientFilter}
            onChange={(e) => setSelectedClientFilter(e.target.value)}
          >
            <option value="">All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            className="input py-1.5 text-xs w-full sm:w-36"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      {/* Website Table */}
      {isLoading ? (
        <div className="card p-12 text-center text-sm text-surface-400">Loading website directory…</div>
      ) : websites.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No websites registered"
          description="Register your clients' primary websites and subdomains to start tracking SEO performance."
          actionText={permissions.includes('websites.create') ? 'Register Website' : null}
          onAction={() => setIsAddOpen(true)}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Domain / Name</th>
                <th>Client</th>
                <th>Integrations</th>
                <th>Status</th>
                <th>Registered</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {websites.map((ws) => (
                <tr key={ws.id}>
                  <td>
                    <div className="font-semibold text-surface-900 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-surface-400" />
                      <Link to={`/websites/${ws.id}`} className="hover:text-brand-600">
                        {ws.domain}
                      </Link>
                    </div>
                    <div className="text-2xs text-surface-400">{ws.name}</div>
                  </td>
                  <td>
                    <Link
                      to={`/clients/${ws.client.id}`}
                      className="text-xs font-medium text-surface-700 hover:text-brand-600 flex items-center gap-1"
                    >
                      <Building2 className="w-3.5 h-3.5 text-surface-400" />
                      {ws.client.name}
                    </Link>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {['GA4', 'GSC', 'CLARITY'].map((type) => {
                        const integration = ws.integrations?.find((i) => i.integrationType === type);
                        const isConnected = integration?.status === 'CONNECTED';
                        return (
                          <span
                            key={type}
                            title={`${type}: ${isConnected ? 'Connected' : 'Not Connected'}`}
                            className={`px-1.5 py-0.5 rounded text-2xs font-bold ${
                              isConnected
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-surface-100 text-surface-400'
                            }`}
                          >
                            {type}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={ws.status} />
                  </td>
                  <td className="text-xs text-surface-400">
                    {new Date(ws.createdAt).toLocaleDateString()}
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link to={`/websites/${ws.id}`} className="btn-ghost btn-sm text-surface-600">
                        Details
                      </Link>
                      {permissions.includes('websites.archive') && (
                        <button
                          onClick={() => handleArchive(ws.id)}
                          title="Toggle Archive"
                          className="p-1.5 text-surface-400 hover:text-amber-600 rounded"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      )}
                      {permissions.includes('websites.delete') && (
                        <button
                          onClick={() => handleDelete(ws.id, ws.domain)}
                          title="Delete Website"
                          className="p-1.5 text-surface-400 hover:text-danger-600 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Website Modal */}
      <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Register Website">
        <form onSubmit={handleSubmit(handleCreate)} className="space-y-4">
          <div>
            <label className="label">Associated Client *</label>
            <select
              className={`input ${errors.clientId ? 'input-error' : ''}`}
              {...register('clientId')}
            >
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.clientId && <p className="field-error">{errors.clientId.message}</p>}
          </div>

          <div>
            <label className="label">Website Display Name *</label>
            <input
              type="text"
              className={`input ${errors.name ? 'input-error' : ''}`}
              placeholder="e.g. Acme Main Store"
              {...register('name')}
            />
            {errors.name && <p className="field-error">{errors.name.message}</p>}
          </div>

          <div>
            <label className="label">Domain (normalized automatically) *</label>
            <input
              type="text"
              className={`input ${errors.domain ? 'input-error' : ''}`}
              placeholder="acme.com"
              {...register('domain')}
            />
            <p className="text-2xs text-surface-400 mt-1">
              Protocols (https://) and www. prefixes are automatically stripped.
            </p>
            {errors.domain && <p className="field-error">{errors.domain.message}</p>}
          </div>

          <div>
            <label className="label">Full Canonical URL</label>
            <input
              type="url"
              className={`input ${errors.url ? 'input-error' : ''}`}
              placeholder="https://www.acme.com"
              {...register('url')}
            />
            {errors.url && <p className="field-error">{errors.url.message}</p>}
          </div>

          <div>
            <label className="label">Description / Scope</label>
            <textarea
              className="input h-20 resize-none"
              placeholder="e.g. Primary e-commerce portal, covers UK & EU markets"
              {...register('description')}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
            <button type="button" onClick={() => setIsAddOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isCreating} className="btn-primary">
              {isCreating ? 'Registering…' : 'Register Website'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
