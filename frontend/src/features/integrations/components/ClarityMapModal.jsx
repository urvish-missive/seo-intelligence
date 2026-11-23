// frontend/src/features/integrations/components/ClarityMapModal.jsx
import React, { useState, useEffect } from 'react';
import Modal from '../../../components/common/Modal.jsx';
import {
  useGetClarityConnectionsQuery,
  useMapWebsiteToClarityMutation,
} from '../integrationsApi.js';
import { RefreshCw, Link2, ExternalLink } from 'lucide-react';

export default function ClarityMapModal({ isOpen, onClose, workspaceId, website }) {
  const [selectedConnectionId, setSelectedConnectionId] = useState('');

  const { data: connectionsData, isLoading } = useGetClarityConnectionsQuery(workspaceId, {
    skip: !isOpen || !workspaceId,
  });

  const [mapWebsite, { isLoading: isMapping }] = useMapWebsiteToClarityMutation();

  const connections = connectionsData?.data || [];

  useEffect(() => {
    if (connections.length > 0 && !selectedConnectionId) {
      setSelectedConnectionId(connections[0].id);
    }
  }, [connections, selectedConnectionId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedConnectionId) return;

    try {
      await mapWebsite({
        workspaceId,
        websiteId: website.id,
        clarityConnectionId: selectedConnectionId,
      }).unwrap();

      onClose();
    } catch (err) {
      alert(`Mapping failed: ${err?.data?.message || err.message}`);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Link Microsoft Clarity Project"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Select Authorized Clarity Project</label>
          {isLoading ? (
            <div className="text-xs text-surface-400 py-2">Loading connected projects…</div>
          ) : connections.length === 0 ? (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              No Clarity projects connected yet. Please connect an API token in the{' '}
              <a href="/settings/integrations" className="underline font-semibold" target="_blank">
                Integrations Hub
              </a>{' '}
              first.
            </div>
          ) : (
            <select
              value={selectedConnectionId}
              onChange={(e) => setSelectedConnectionId(e.target.value)}
              className="input text-sm"
              required
            >
              {connections.map((conn) => {
                const isMatch =
                  website?.domain &&
                  (conn.projectName?.toLowerCase().includes(website.domain.toLowerCase()) ||
                    conn.projectId.toLowerCase().includes(website.domain.toLowerCase()));
                return (
                  <option key={conn.id} value={conn.id}>
                    {conn.projectName || conn.projectId} (Project ID: {conn.projectId})
                    {isMatch ? ' ★ Recommended' : ''}
                  </option>
                );
              })}
            </select>
          )}
        </div>

        <p className="text-xs text-surface-500">
          Associates this website with the selected Clarity project. Behavioral metrics (dead clicks, rage clicks, scroll depth) will be collected and mapped specifically to <strong>{website?.domain}</strong>.
        </p>

        <div className="flex justify-end gap-3 pt-3 border-t border-surface-100">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!selectedConnectionId || isMapping || connections.length === 0}
            className="btn-primary inline-flex items-center gap-2"
          >
            {isMapping ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Link2 className="w-4 h-4" />
            )}
            <span>Save Association</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
