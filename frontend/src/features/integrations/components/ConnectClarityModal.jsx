// frontend/src/features/integrations/components/ConnectClarityModal.jsx
import React, { useState } from 'react';
import Modal from '../../../components/common/Modal.jsx';
import { useConnectClarityProjectMutation } from '../integrationsApi.js';
import { RefreshCw, Key, ShieldCheck, ExternalLink, AlertCircle } from 'lucide-react';

export default function ConnectClarityModal({ isOpen, onClose, workspaceId }) {
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [connectClarity, { isLoading }] = useConnectClarityProjectMutation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    try {
      await connectClarity({
        workspaceId,
        projectId: projectId.trim(),
        projectName: projectName ? projectName.trim() : undefined,
        apiToken: apiToken.trim(),
      }).unwrap();

      // Clear transient sensitive state
      setProjectId('');
      setProjectName('');
      setApiToken('');
      onClose();
    } catch (err) {
      setErrorMsg(err?.data?.message || err.message || 'Connection failed.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Connect Microsoft Clarity Project"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Step-by-Step Instructions */}
        <div className="p-3.5 rounded-xl bg-surface-50 border border-surface-200 text-xs text-surface-600 space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-surface-900">
            <Key className="w-4 h-4 text-brand-600" />
            <span>How to generate your Clarity API Token:</span>
          </div>
          <ol className="list-decimal list-inside space-y-1 text-surface-600 pl-1">
            <li>
              Log in to the{' '}
              <a
                href="https://clarity.microsoft.com"
                target="_blank"
                rel="noreferrer"
                className="text-brand-600 underline font-medium inline-flex items-center gap-0.5"
              >
                Microsoft Clarity Dashboard
                <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li>Select the target project and open <strong>Settings</strong></li>
            <li>Navigate to <strong>Data Export</strong></li>
            <li>Click <strong>Generate new API token</strong> and copy it</li>
          </ol>
        </div>

        {/* Inputs */}
        <div>
          <label className="label">Clarity Project ID</label>
          <input
            type="text"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="e.g. k8s9x2abc"
            className="input text-sm font-mono"
            required
          />
          <p className="text-2xs text-surface-400 mt-1">
            Found in your Clarity project settings or URL.
          </p>
        </div>

        <div>
          <label className="label">Display Name (Optional)</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="e.g. Main Production Website"
            className="input text-sm"
          />
        </div>

        <div>
          <label className="label">Data Export API Token</label>
          <input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder="Paste your generated Clarity API token"
            className="input text-sm font-mono"
            required
            autoComplete="off"
          />
          <p className="text-2xs text-surface-400 mt-1 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-600" />
            <span>Encrypted at rest with AES-256-GCM. Never logged or exposed in frontend state.</span>
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Validation Error</p>
              <p>{errorMsg}</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-3 border-t border-surface-100">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!projectId || !apiToken || isLoading}
            className="btn-primary inline-flex items-center gap-2"
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Key className="w-4 h-4" />
            )}
            <span>{isLoading ? 'Validating with Microsoft…' : 'Validate & Connect'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
