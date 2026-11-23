// frontend/src/features/integrations/components/PropertySelectModal.jsx
import React, { useState, useEffect } from 'react';
import Modal from '../../../components/common/Modal.jsx';
import {
  useGetGoogleAccountsQuery,
  useLazyGetGA4PropertiesQuery,
  useLazyGetGSCSitesQuery,
  useConnectWebsitePropertyMutation,
} from '../integrationsApi.js';
import { RefreshCw, CheckCircle2 } from 'lucide-react';

export default function PropertySelectModal({
  isOpen,
  onClose,
  workspaceId,
  website,
  integrationType, // 'GA4' | 'GSC'
}) {
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedProperty, setSelectedProperty] = useState('');
  const [selectedPropertyName, setSelectedPropertyName] = useState('');

  const { data: accountsData, isLoading: isLoadingAccounts } = useGetGoogleAccountsQuery(
    workspaceId,
    { skip: !isOpen || !workspaceId }
  );

  const [fetchGA4, { data: ga4Data, isFetching: isFetchingGA4 }] = useLazyGetGA4PropertiesQuery();
  const [fetchGSC, { data: gscData, isFetching: isFetchingGSC }] = useLazyGetGSCSitesQuery();
  const [connectProperty, { isLoading: isConnecting }] = useConnectWebsitePropertyMutation();

  const accounts = accountsData?.data || [];
  const properties =
    integrationType === 'GA4' ? ga4Data?.data || [] : gscData?.data || [];
  const isFetchingProperties = isFetchingGA4 || isFetchingGSC;

  // Set default account when accounts load
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // Fetch properties when account changes
  useEffect(() => {
    if (selectedAccountId && isOpen) {
      if (integrationType === 'GA4') {
        fetchGA4({ workspaceId, accountId: selectedAccountId });
      } else if (integrationType === 'GSC') {
        fetchGSC({ workspaceId, accountId: selectedAccountId });
      }
      setSelectedProperty('');
      setSelectedPropertyName('');
    }
  }, [selectedAccountId, integrationType, isOpen, workspaceId, fetchGA4, fetchGSC]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProperty) return;

    try {
      await connectProperty({
        workspaceId,
        websiteId: website.id,
        integrationType,
        googleAccountId: selectedAccountId,
        selectedProperty,
        selectedPropertyName: selectedPropertyName || selectedProperty,
      }).unwrap();

      onClose();
    } catch (err) {
      alert(`Connection failed: ${err?.data?.message || err.message}`);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Connect ${integrationType === 'GA4' ? 'Google Analytics 4' : 'Google Search Console'}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Step 1: Select Google Account */}
        <div>
          <label className="label">1. Select Authorized Google Account</label>
          {isLoadingAccounts ? (
            <div className="text-xs text-surface-400 py-2">Loading connected Google accounts…</div>
          ) : accounts.length === 0 ? (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              No Google accounts connected yet. Please connect an account in the{' '}
              <a href="/settings/integrations" className="underline font-semibold" target="_blank">
                Integrations Hub
              </a>{' '}
              first.
            </div>
          ) : (
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="input text-sm"
              required
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.email} ({acc.displayName || 'Google Account'})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Step 2: Select Property */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">
              2. Select {integrationType === 'GA4' ? 'GA4 Property' : 'Verified Search Console Site'}
            </label>
            {isFetchingProperties && (
              <span className="text-xs text-brand-600 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Discovering properties…
              </span>
            )}
          </div>

          <select
            value={selectedProperty}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedProperty(val);
              if (integrationType === 'GA4') {
                const found = properties.find((p) => p.propertyId === val);
                setSelectedPropertyName(found ? found.displayName : val);
              } else {
                setSelectedPropertyName(val);
              }
            }}
            disabled={isFetchingProperties || properties.length === 0}
            className="input text-sm"
            required
          >
            <option value="">-- Choose a property --</option>
            {integrationType === 'GA4'
              ? properties.map((p) => {
                  const isMatch =
                    website?.domain &&
                    p.displayName.toLowerCase().includes(website.domain.toLowerCase());
                  return (
                    <option key={p.propertyId} value={p.propertyId}>
                      {p.displayName} ({p.propertyId}){isMatch ? ' ★ Recommended' : ''}
                    </option>
                  );
                })
              : properties.map((s) => {
                  const isMatch =
                    website?.domain && s.siteUrl.toLowerCase().includes(website.domain.toLowerCase());
                  return (
                    <option key={s.siteUrl} value={s.siteUrl}>
                      {s.siteUrl} [{s.permissionLevel}]{isMatch ? ' ★ Recommended' : ''}
                    </option>
                  );
                })}
          </select>
          {properties.length === 0 && !isFetchingProperties && selectedAccountId && (
            <p className="text-xs text-surface-400 mt-1">
              No accessible {integrationType === 'GA4' ? 'GA4 properties' : 'GSC sites'} were found on this account.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-surface-100">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!selectedProperty || isConnecting}
            className="btn-primary inline-flex items-center gap-2"
          >
            {isConnecting && <RefreshCw className="w-4 h-4 animate-spin" />}
            <span>Save Association</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
