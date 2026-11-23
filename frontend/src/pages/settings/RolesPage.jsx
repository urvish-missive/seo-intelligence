// frontend/src/pages/settings/RolesPage.jsx
import React from 'react';
import { useSelector } from 'react-redux';
import { selectActiveWorkspace } from '../../features/auth/authSlice.js';
import { useGetRolesQuery, useGetPermissionsQuery } from '../../features/roles/rolesApi.js';
import { Shield, Check, Minus } from 'lucide-react';

export default function RolesPage() {
  const workspace = useSelector(selectActiveWorkspace);

  const { data: rolesData, isLoading: rolesLoading } = useGetRolesQuery(workspace?.id, {
    skip: !workspace?.id,
  });

  const { data: permissionsData, isLoading: permsLoading } = useGetPermissionsQuery(workspace?.id, {
    skip: !workspace?.id,
  });

  const roles = rolesData?.data || [];
  const permissions = permissionsData?.data || [];

  // Group permissions by module
  const permissionsByModule = permissions.reduce((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
          Roles & Role-Based Access Control (RBAC)
        </h1>
        <p className="text-sm text-surface-500 mt-1">
          Inspect dynamic permissions assigned to built-in system roles and workspace configurations.
        </p>
      </div>

      {rolesLoading || permsLoading ? (
        <div className="card p-12 text-center text-sm text-surface-400">Loading RBAC matrix…</div>
      ) : (
        <div className="space-y-6">
          {/* System Roles Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {roles.map((r) => (
              <div key={r.id} className="card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-surface-900">{r.name}</span>
                  {r.isSystem && (
                    <span className="text-2xs bg-surface-100 text-surface-500 px-1.5 py-0.5 rounded font-mono">
                      System
                    </span>
                  )}
                </div>
                <p className="text-2xs text-surface-500 line-clamp-2">{r.description}</p>
                <div className="text-xs text-brand-600 font-medium pt-1">
                  {r.permissions?.length || 0} permissions
                </div>
              </div>
            ))}
          </div>

          {/* Detailed Permission Matrix */}
          <div className="card overflow-hidden">
            <div className="card-header border-b border-surface-100">
              <h2 className="text-sm font-semibold text-surface-900">Permission Matrix</h2>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-1/3">Permission Key / Description</th>
                    {roles.map((r) => (
                      <th key={r.id} className="text-center font-semibold text-surface-700">
                        {r.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(permissionsByModule).map(([moduleName, perms]) => (
                    <React.Fragment key={moduleName}>
                      <tr className="bg-surface-50">
                        <td
                          colSpan={roles.length + 1}
                          className="font-bold text-xs uppercase tracking-wider text-surface-500 py-2 px-4"
                        >
                          Module: {moduleName}
                        </td>
                      </tr>
                      {perms.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div className="font-mono text-xs text-surface-800">{p.key}</div>
                            <div className="text-2xs text-surface-400">{p.description}</div>
                          </td>
                          {roles.map((r) => {
                            const hasPerm = r.permissions?.some((rp) => rp.permissionId === p.id);
                            return (
                              <td key={r.id} className="text-center">
                                {hasPerm ? (
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-600">
                                    <Check className="w-3.5 h-3.5" />
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center justify-center w-5 h-5 text-surface-300">
                                    <Minus className="w-3.5 h-3.5" />
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
