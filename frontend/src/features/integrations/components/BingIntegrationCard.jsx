// frontend/src/features/integrations/components/BingIntegrationCard.jsx
// Bing Webmaster Tools card for a website's Analytics Integrations tab:
// connect with an API key, choose the site, import, change or unlink.

import React, { useEffect, useRef, useState } from 'react';
import { Link2, RefreshCw, Unlink, Loader2, CheckCircle2, AlertCircle, KeyRound, ExternalLink } from 'lucide-react';
import Modal from '../../../components/common/Modal.jsx';
import {
  useGetBingStatusQuery,
  useListBingSitesMutation,
  useConnectBingMutation,
  useImportBingMutation,
  useDisconnectBingMutation,
} from '../bingApi.js';

const errorText = (e) => e?.data?.error?.message || e?.data?.message || e?.message || 'Something went wrong.';
const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function ConnectBingModal({ isOpen, onClose, workspaceId, websiteId, websiteDomain, hasStoredKey, currentSite, onConnected }) {
  const [apiKey, setApiKey] = useState('');
  const [sites, setSites] = useState(null);
  const [siteUrl, setSiteUrl] = useState('');
  const [error, setError] = useState(null);
  const [listSites, { isLoading: loading }] = useListBingSitesMutation();
  const [connectBing, { isLoading: connecting }] = useConnectBingMutation();

  // Changing the site of an existing connection: load sites with the saved key
  useEffect(() => {
    if (!isOpen) return;
    setApiKey('');
    setSites(null);
    setSiteUrl('');
    setError(null);
    if (hasStoredKey) loadSites('');
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSites(key) {
    setError(null);
    try {
      const res = await listSites({ workspaceId, websiteId, apiKey: key }).unwrap();
      setSites(res.data.sites);
      setSiteUrl(currentSite || res.data.suggested || res.data.sites[0]?.url || '');
      if (!res.data.sites.length) setError('This API key has no sites in Bing Webmaster Tools. Add and verify the site there first.');
    } catch (e) {
      setSites(null);
      setError(errorText(e));
    }
  }

  async function connect() {
    setError(null);
    try {
      await connectBing({ workspaceId, websiteId, apiKey: apiKey.trim() || undefined, siteUrl }).unwrap();
      onConnected();
      onClose();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Connect Bing Webmaster Tools">
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-brand-50 border border-brand-100 text-xs text-surface-700 space-y-1">
          <p className="font-semibold text-surface-800">Get your API key</p>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>
              Open{' '}
              <a href="https://www.bing.com/webmasters" target="_blank" rel="noreferrer" className="text-brand-700 underline inline-flex items-center gap-0.5">
                Bing Webmaster Tools <ExternalLink className="w-3 h-3" />
              </a>{' '}
              and sign in.
            </li>
            <li>
              Click the <strong>Settings</strong> (gear) icon → <strong>API access</strong> → <strong>API key</strong>.
            </li>
            <li>Generate or copy the key and paste it below.</li>
          </ol>
          <p className="text-surface-500">The key is stored encrypted and only used to read this site&apos;s search data.</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-surface-700 mb-1.5">
            API key {hasStoredKey && <span className="text-surface-400 font-normal">(leave empty to keep the saved key)</span>}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <KeyRound className="w-4 h-4 text-surface-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="input w-full pl-8 font-mono text-xs"
                placeholder={hasStoredKey ? '•••••••• saved' : 'Paste your Bing API key'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm whitespace-nowrap"
              onClick={() => loadSites(apiKey.trim())}
              disabled={loading || (!apiKey.trim() && !hasStoredKey)}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Load my sites
            </button>
          </div>
        </div>

        {sites && sites.length > 0 && (
          <div>
            <p className="text-xs font-medium text-surface-700 mb-1.5">Choose the site for {websiteDomain}</p>
            <div className="max-h-56 overflow-y-auto border border-surface-200 rounded-lg divide-y divide-surface-100">
              {sites.map((s) => (
                <label key={s.url} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-surface-50">
                  <input type="radio" name="bing-site" checked={siteUrl === s.url} onChange={() => setSiteUrl(s.url)} />
                  <span className="flex-1 break-all">{s.url}</span>
                  {s.verified === false && <span className="text-2xs text-amber-600">Not verified</span>}
                </label>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-surface-100">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={connect} disabled={!siteUrl || connecting}>
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Connect &amp; import
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function BingIntegrationCard({ workspaceId, websiteId, websiteDomain }) {
  const statusQuery = useGetBingStatusQuery({ workspaceId, websiteId }, { skip: !workspaceId || !websiteId });
  const status = statusQuery.data?.data;
  const [importBing] = useImportBingMutation();
  const [disconnectBing, { isLoading: unlinking }] = useDisconnectBingMutation();
  const [modalOpen, setModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

  // Imports run in the background sync queue: watch the status until lastSyncAt moves on
  async function startImport() {
    setMessage(null);
    setImporting(true);
    const before = status?.lastSyncAt;
    try {
      await importBing({ workspaceId, websiteId }).unwrap();
    } catch (e) {
      setImporting(false);
      setMessage({ tone: 'bad', text: errorText(e) });
      return;
    }
    let tries = 0;
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      tries += 1;
      const res = await statusQuery.refetch();
      const s = res.data?.data;
      const done = s && s.lastSyncAt && s.lastSyncAt !== before && s.status !== 'SYNCING';
      if (done || tries > 40) {
        clearInterval(pollRef.current);
        setImporting(false);
        if (s?.lastSyncStatus === 'FAILED') setMessage({ tone: 'bad', text: s.lastError || 'Import failed.' });
        else if (done) setMessage({ tone: 'good', text: `Imported ${s.data.days} days of Bing data (${fmtDate(s.data.from)} – ${fmtDate(s.data.to)}).` });
        else setMessage({ tone: 'info', text: 'Still importing in the background. Check back in a minute.' });
      }
    }, 3000);
  }

  async function unlink() {
    if (!window.confirm('Unlink Bing Webmaster Tools from this website? Imported data stays, but daily sync stops and the saved API key is removed.')) return;
    try {
      await disconnectBing({ workspaceId, websiteId }).unwrap();
      setMessage(null);
    } catch (e) {
      setMessage({ tone: 'bad', text: errorText(e) });
    }
  }

  const connected = !!status?.connected;

  return (
    <div className="p-4 rounded-xl border border-surface-200 bg-surface-50/50 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-surface-900">Bing Webmaster Tools</span>
          <span className="text-2xs bg-surface-200 text-surface-700 px-1.5 py-0.5 rounded font-mono">BING</span>
          <span
            className={`text-2xs px-2 py-0.5 rounded-full font-semibold ${
              connected ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-200 text-surface-600'
            }`}
          >
            {importing ? 'SYNCING' : status?.status || 'NOT_CONNECTED'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <button onClick={startImport} disabled={importing} className="btn-secondary btn-sm inline-flex items-center gap-1 text-xs">
                <RefreshCw className={`w-3.5 h-3.5 ${importing ? 'animate-spin' : ''}`} />
                <span>{importing ? 'Importing…' : 'Import Data'}</span>
              </button>
              <button onClick={() => setModalOpen(true)} className="btn-secondary btn-sm text-xs">
                Change
              </button>
              <button onClick={unlink} disabled={unlinking} className="text-xs text-rose-600 hover:underline p-1" title="Unlink Bing Webmaster Tools">
                <Unlink className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button onClick={() => setModalOpen(true)} className="btn-primary btn-sm inline-flex items-center gap-1.5 text-xs">
              <Link2 className="w-3.5 h-3.5" />
              <span>Connect Bing</span>
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-surface-500">
        Bing search clicks, impressions, CTR, top queries and pages, with average positions. Syncs automatically every 12 hours.
      </p>

      {connected && (
        <div className="p-2.5 rounded-lg bg-surface-100 text-xs text-surface-700 flex flex-wrap items-center gap-4">
          <div>
            Site: <strong>{status.siteUrl}</strong>
          </div>
          {status.data.days > 0 && (
            <div>
              Data: <strong>{status.data.days} days</strong> ({fmtDate(status.data.from)} – {fmtDate(status.data.to)})
            </div>
          )}
          {status.lastSyncAt && <div className="text-surface-500">Last synced: {new Date(status.lastSyncAt).toLocaleString()}</div>}
          {status.lastSyncStatus === 'FAILED' && status.lastError && <div className="text-rose-600">Last sync failed: {status.lastError}</div>}
        </div>
      )}

      {message && (
        <div
          className={`p-2.5 rounded-lg text-xs flex gap-2 ${
            message.tone === 'good'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : message.tone === 'bad'
                ? 'bg-rose-50 border border-rose-200 text-rose-700'
                : 'bg-surface-100 text-surface-700'
          }`}
        >
          {message.tone === 'good' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {message.text}
        </div>
      )}

      <ConnectBingModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        workspaceId={workspaceId}
        websiteId={websiteId}
        websiteDomain={websiteDomain}
        hasStoredKey={connected}
        currentSite={status?.siteUrl}
        onConnected={() => startImport()}
      />
    </div>
  );
}
