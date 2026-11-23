// frontend/src/pages/members/MembersPage.jsx
import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  selectActiveWorkspace,
  selectCurrentUser,
  selectUserPermissions,
} from '../../features/auth/authSlice.js';
import {
  useGetMembersQuery,
  useInviteMemberMutation,
  useGetInvitationsQuery,
  useResendInvitationMutation,
  useRevokeInvitationMutation,
  useUpdateMemberMutation,
  useRemoveMemberMutation,
} from '../../features/members/membersApi.js';
import { useGetRolesQuery } from '../../features/roles/rolesApi.js';
import Modal from '../../components/common/Modal.jsx';
import StatusBadge from '../../components/common/StatusBadge.jsx';
import {
  Users,
  Plus,
  Mail,
  Shield,
  Trash2,
  Send,
  XCircle,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';

const inviteSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  roleId: z.string().uuid('Please select a role'),
});

export default function MembersPage() {
  const workspace = useSelector(selectActiveWorkspace);
  const currentUser = useSelector(selectCurrentUser);
  const permissions = useSelector(selectUserPermissions);

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [createdInviteLink, setCreatedInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  const { data: membersData, isLoading } = useGetMembersQuery(workspace?.id, {
    skip: !workspace?.id,
  });

  const { data: invitationsData } = useGetInvitationsQuery(workspace?.id, {
    skip: !workspace?.id,
  });

  const { data: rolesData } = useGetRolesQuery(workspace?.id, {
    skip: !workspace?.id,
  });

  const [inviteMember, { isLoading: isInviting }] = useInviteMemberMutation();
  const [resendInvitation] = useResendInvitationMutation();
  const [revokeInvitation] = useRevokeInvitationMutation();
  const [updateMember] = useUpdateMemberMutation();
  const [removeMember] = useRemoveMemberMutation();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(inviteSchema),
  });

  const handleInvite = async (formData) => {
    try {
      const res = await inviteMember({
        workspaceId: workspace.id,
        ...formData,
      }).unwrap();

      if (res.data?.invitationLink) {
        setCreatedInviteLink(res.data.invitationLink);
      } else {
        setIsInviteOpen(false);
        reset();
      }
    } catch (err) {
      console.error('Invite error:', err);
    }
  };

  const handleRoleChange = async (memberId, newRoleId) => {
    try {
      await updateMember({
        workspaceId: workspace.id,
        memberId,
        roleId: newRoleId,
      }).unwrap();
    } catch (err) {
      console.error('Role update error:', err);
    }
  };

  const handleRemove = async (memberId, memberName) => {
    if (window.confirm(`Are you sure you want to remove ${memberName} from this workspace?`)) {
      await removeMember({ workspaceId: workspace.id, memberId });
    }
  };

  const members = membersData?.data || [];
  const invitations = invitationsData?.data || [];
  const roles = rolesData?.data || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Team Members</h1>
          <p className="text-sm text-surface-500 mt-1">
            Manage agency specialists, access roles, and onboarding invitations.
          </p>
        </div>
        {permissions.includes('members.invite') && (
          <button onClick={() => { setIsInviteOpen(true); setCreatedInviteLink(''); }} className="btn-primary">
            <Plus className="w-4 h-4" />
            <span>Invite Member</span>
          </button>
        )}
      </div>

      {/* Members Table */}
      <div className="card overflow-hidden">
        <div className="card-header border-b border-surface-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-surface-900">Active Members ({members.length})</h2>
          <span className="text-xs text-surface-400">Owner protection active</span>
        </div>
        {isLoading ? (
          <div className="p-12 text-center text-sm text-surface-400">Loading members…</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.userId === currentUser?.id;
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="font-semibold text-surface-900 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold">
                          {m.name.charAt(0)}
                        </div>
                        <div>
                          <span>{m.name}</span>
                          {m.isOwner && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-2xs font-bold">
                              Owner
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="text-surface-600 text-xs">{m.email}</td>
                    <td>
                      {permissions.includes('members.update') && !m.isOwner ? (
                        <select
                          className="input py-1 text-xs w-36"
                          value={m.role.id}
                          onChange={(e) => handleRoleChange(m.id, e.target.value)}
                        >
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-surface-700">
                          <Shield className="w-3 h-3 text-brand-600" />
                          {m.role.name}
                        </span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={m.membershipStatus} />
                    </td>
                    <td className="text-xs text-surface-400">
                      {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : 'Pending'}
                    </td>
                    <td className="text-right">
                      {permissions.includes('members.remove') && !m.isOwner && !isSelf && (
                        <button
                          onClick={() => handleRemove(m.id, m.name)}
                          title="Remove Member"
                          className="p-1.5 text-surface-400 hover:text-danger-600 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pending Invitations Section */}
      {invitations.length > 0 && (
        <div className="card overflow-hidden">
          <div className="card-header border-b border-surface-100">
            <h2 className="text-sm font-semibold text-surface-900">
              Pending Invitations ({invitations.length})
            </h2>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Invited Email</th>
                <th>Role</th>
                <th>Invited By</th>
                <th>Expires</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id}>
                  <td className="font-medium text-surface-900">{inv.email}</td>
                  <td>
                    <span className="text-xs text-surface-700 font-medium">{inv.role.name}</span>
                  </td>
                  <td className="text-xs text-surface-500">{inv.invitedBy?.name || 'Admin'}</td>
                  <td className="text-xs text-surface-400">
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() =>
                          resendInvitation({ workspaceId: workspace.id, invitationId: inv.id })
                        }
                        title="Resend invitation"
                        className="btn-ghost btn-sm text-brand-600"
                      >
                        Resend
                      </button>
                      <button
                        onClick={() =>
                          revokeInvitation({ workspaceId: workspace.id, invitationId: inv.id })
                        }
                        title="Revoke invitation"
                        className="p-1 text-surface-400 hover:text-danger-600"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite Member Modal */}
      <Modal isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)} title="Invite Team Member">
        {createdInviteLink ? (
          <div className="space-y-4">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs">
              <strong>Invitation created successfully!</strong> Share the onboarding link below with the invited user:
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={createdInviteLink}
                className="input font-mono text-xs"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(createdInviteLink);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="btn-secondary whitespace-nowrap"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied' : 'Copy Link'}</span>
              </button>
            </div>
            <div className="flex justify-end pt-2 border-t border-surface-100">
              <button onClick={() => { setIsInviteOpen(false); reset(); }} className="btn-primary">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(handleInvite)} className="space-y-4">
            <div>
              <label className="label">Specialist Email Address *</label>
              <input
                type="email"
                className={`input ${errors.email ? 'input-error' : ''}`}
                placeholder="colleague@agency.com"
                {...register('email')}
              />
              {errors.email && <p className="field-error">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Assigned Role *</label>
              <select className={`input ${errors.roleId ? 'input-error' : ''}`} {...register('roleId')}>
                <option value="">Select an access role…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.description}
                  </option>
                ))}
              </select>
              {errors.roleId && <p className="field-error">{errors.roleId.message}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
              <button type="button" onClick={() => setIsInviteOpen(false)} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={isInviting} className="btn-primary">
                {isInviting ? 'Generating Invitation…' : 'Send Invitation'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
