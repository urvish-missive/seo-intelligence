// frontend/src/pages/clients/ClientsPage.jsx
import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { selectActiveWorkspace, selectUserPermissions } from '../../features/auth/authSlice.js';
import {
  useGetClientsQuery,
  useCreateClientMutation,
  useArchiveClientMutation,
  useDeleteClientMutation,
} from '../../features/clients/clientsApi.js';
import Modal from '../../components/common/Modal.jsx';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import {
  Building2,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Globe,
  Archive,
  Trash2,
  ExternalLink,
} from 'lucide-react';

const clientSchema = z.object({
  name: z.string().trim().min(2, 'Client name must be at least 2 characters'),
  companyName: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  website: z.string().trim().url('Invalid website URL').optional().or(z.literal('')),
  notes: z.string().max(1000).optional(),
});

export default function ClientsPage() {
  const workspace = useSelector(selectActiveWorkspace);
  const permissions = useSelector(selectUserPermissions);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data, isLoading } = useGetClientsQuery(
    {
      workspaceId: workspace?.id,
      search: search || undefined,
      status: statusFilter || undefined,
      page,
      limit: 15,
    },
    { skip: !workspace?.id }
  );

  const [createClient, { isLoading: isCreating }] = useCreateClientMutation();
  const [archiveClient] = useArchiveClientMutation();
  const [deleteClient] = useDeleteClientMutation();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(clientSchema),
  });

  const handleCreate = async (formData) => {
    try {
      await createClient({
        workspaceId: workspace.id,
        ...formData,
      }).unwrap();
      setIsCreateOpen(false);
      reset();
    } catch (err) {
      console.error('Failed to create client:', err);
    }
  };

  const handleArchive = async (clientId) => {
    if (window.confirm('Toggle archive status for this client?')) {
      await archiveClient({ workspaceId: workspace.id, clientId });
    }
  };

  const handleDelete = async (clientId, name) => {
    if (window.confirm(`Permanently delete client "${name}" and all associated records?`)) {
      await deleteClient({ workspaceId: workspace.id, clientId });
    }
  };

  const clients = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Clients</h1>
          <p className="text-sm text-surface-500 mt-1">
            Manage your agency accounts, client websites, and assigned team members.
          </p>
        </div>
        {permissions.includes('clients.create') && (
          <button onClick={() => setIsCreateOpen(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            <span>Add Client</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-surface-400 absolute left-3 top-3" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Search clients or email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-surface-400" />
          <select
            className="input py-1.5 text-xs w-full sm:w-40"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      {/* Client Table / Grid */}
      {isLoading ? (
        <div className="card p-12 text-center text-sm text-surface-400">Loading clients…</div>
      ) : clients.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients found"
          description="Get started by creating your agency's first client account."
          actionText={permissions.includes('clients.create') ? 'Create Client' : null}
          onAction={() => setIsCreateOpen(true)}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Company / Contact</th>
                  <th>Websites</th>
                  <th>Team</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <Link
                        to={`/clients/${client.id}`}
                        className="font-semibold text-surface-900 hover:text-brand-600 block"
                      >
                        {client.name}
                      </Link>
                      {client.website && (
                        <a
                          href={client.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-2xs text-surface-400 hover:underline flex items-center gap-1 mt-0.5"
                        >
                          {client.website.replace(/^https?:\/\//, '')}
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </td>
                    <td>
                      <div className="text-surface-800 font-medium">
                        {client.companyName || '—'}
                      </div>
                      <div className="text-2xs text-surface-400">{client.contactEmail || 'No email'}</div>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-100 text-surface-700 text-xs font-medium">
                        <Globe className="w-3.5 h-3.5 text-surface-400" />
                        {client.websiteCount}
                      </span>
                    </td>
                    <td>
                      <div className="flex -space-x-1.5 overflow-hidden">
                        {client.assignedMembers.map((m) => (
                          <div
                            key={m.id}
                            title={m.name}
                            className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-brand-600 text-white text-2xs font-semibold flex items-center justify-center"
                          >
                            {m.name.charAt(0)}
                          </div>
                        ))}
                        {client.assignedMembers.length === 0 && (
                          <span className="text-2xs text-surface-400">Unassigned</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={client.status} />
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          to={`/clients/${client.id}`}
                          className="btn-ghost btn-sm text-surface-600"
                        >
                          View
                        </Link>
                        {permissions.includes('clients.archive') && (
                          <button
                            onClick={() => handleArchive(client.id)}
                            title="Toggle Archive"
                            className="p-1.5 text-surface-400 hover:text-amber-600 rounded"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                        {permissions.includes('clients.delete') && (
                          <button
                            onClick={() => handleDelete(client.id, client.name)}
                            title="Delete Client"
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

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="px-6 py-3 border-t border-surface-100 flex items-center justify-between text-xs text-surface-500">
              <span>
                Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} clients)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={!pagination.hasPrev}
                  onClick={() => setPage(p => p - 1)}
                  className="btn-secondary btn-sm"
                >
                  Previous
                </button>
                <button
                  disabled={!pagination.hasNext}
                  onClick={() => setPage(p => p + 1)}
                  className="btn-secondary btn-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Client Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create New Client">
        <form onSubmit={handleSubmit(handleCreate)} className="space-y-4">
          <div>
            <label className="label">Client / Brand Name *</label>
            <input
              type="text"
              className={`input ${errors.name ? 'input-error' : ''}`}
              placeholder="e.g. Acme Corp"
              {...register('name')}
            />
            {errors.name && <p className="field-error">{errors.name.message}</p>}
          </div>

          <div>
            <label className="label">Legal Company Name</label>
            <input
              type="text"
              className="input"
              placeholder="Acme Corporation Ltd."
              {...register('companyName')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Primary Contact Name</label>
              <input type="text" className="input" placeholder="John Doe" {...register('contactName')} />
            </div>
            <div>
              <label className="label">Contact Email</label>
              <input
                type="email"
                className={`input ${errors.contactEmail ? 'input-error' : ''}`}
                placeholder="contact@acme.com"
                {...register('contactEmail')}
              />
              {errors.contactEmail && (
                <p className="field-error">{errors.contactEmail.message}</p>
              )}
            </div>
          </div>

          <div>
            <label className="label">Primary Website URL</label>
            <input
              type="url"
              className={`input ${errors.website ? 'input-error' : ''}`}
              placeholder="https://acme.com"
              {...register('website')}
            />
            {errors.website && <p className="field-error">{errors.website.message}</p>}
          </div>

          <div>
            <label className="label">Internal Agency Notes</label>
            <textarea
              className="input h-20 resize-none"
              placeholder="Add key account objectives, target audience, or requirements…"
              {...register('notes')}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={isCreating} className="btn-primary">
              {isCreating ? 'Saving…' : 'Create Client'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
