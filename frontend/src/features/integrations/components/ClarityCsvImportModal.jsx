// frontend/src/features/integrations/components/ClarityCsvImportModal.jsx
// Bulk upload of Microsoft Clarity dashboard CSV downloads, one per month.
//
// Clarity's API only returns the last 3 days, but its dashboard keeps about
// 13 months and can be downloaded as CSV. Each file is checked first (preview),
// you confirm the month, then the whole batch is saved in one go.

import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Trash2, Loader2, CheckCircle2, AlertTriangle, X, Info } from 'lucide-react';
import Modal from '../../../components/common/Modal.jsx';
import {
  usePreviewClarityCsvMutation,
  useImportClarityCsvMutation,
  useGetClarityCsvImportsQuery,
  useDeleteClarityCsvImportMutation,
} from '../../analytics/analyticsApi.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym) => (ym ? `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}` : '—');
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const METRIC_LABELS = {
  sessions: 'Sessions',
  distinctUsers: 'Users',
  pagesPerSession: 'Pages/session',
  avgScrollDepth: 'Scroll depth',
  avgTimeOnPageSec: 'Active time',
  botSessions: 'Bot sessions',
  rageClickCount: 'Rage clicks',
  deadClickCount: 'Dead clicks',
  quickbackClickCount: 'Quick-backs',
  excessiveScrollCount: 'Excessive scroll',
  scriptErrorCount: 'Script errors',
  errorClickCount: 'Error clicks',
};

function formatMetric(key, v) {
  if (v === null || v === undefined) return '—';
  if (key === 'avgScrollDepth') return `${v}%`;
  if (key === 'avgTimeOnPageSec') return `${Math.round(v)}s`;
  return Number(v).toLocaleString();
}

function errorText(err) {
  return err?.data?.error?.message || err?.data?.message || err?.message || 'Something went wrong.';
}

export default function ClarityCsvImportModal({ isOpen, onClose, workspaceId, websiteId, websiteName }) {
  const inputRef = useRef(null);
  const [rows, setRows] = useState([]); // { name, content, preview, month }
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [previewCsv, { isLoading: previewing }] = usePreviewClarityCsvMutation();
  const [importCsv, { isLoading: importing }] = useImportClarityCsvMutation();
  const [deleteImport] = useDeleteClarityCsvImportMutation();
  const importsQuery = useGetClarityCsvImportsQuery({ workspaceId, websiteId }, { skip: !isOpen || !websiteId });
  const imports = importsQuery.data?.data?.imports || [];
  const importedMonths = new Set(imports.map((i) => i.month));

  const reset = () => {
    setRows([]);
    setResult(null);
    setError(null);
  };

  const addFiles = async (fileList) => {
    setError(null);
    setResult(null);
    const files = [...fileList].filter((f) => /\.csv$/i.test(f.name));
    if (!files.length) {
      setError('Choose .csv files downloaded from the Clarity dashboard.');
      return;
    }
    const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setError(`${tooBig.name} is larger than 2 MB. Download the dashboard summary rather than a large widget export.`);
      return;
    }
    const read = await Promise.all(files.map(async (f) => ({ name: f.name, content: await f.text() })));
    try {
      const res = await previewCsv({ workspaceId, websiteId, files: read }).unwrap();
      const previews = res.data.files;
      setRows((prev) => {
        const kept = prev.filter((p) => !read.some((r) => r.name === p.name));
        return [
          ...kept,
          ...read.map((r, i) => ({ ...r, preview: previews[i], month: previews[i]?.month || '' })),
        ];
      });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const ready = rows.filter((r) => r.month && r.preview?.metricsFound > 0);
  const duplicateMonths = (() => {
    const seen = new Map();
    rows.forEach((r) => r.month && seen.set(r.month, (seen.get(r.month) || 0) + 1));
    return new Set([...seen].filter(([, n]) => n > 1).map(([m]) => m));
  })();

  const doImport = async () => {
    setError(null);
    try {
      const res = await importCsv({
        workspaceId,
        websiteId,
        files: ready.map((r) => ({ name: r.name, content: r.content, month: r.month })),
      }).unwrap();
      setResult(res.data);
      setRows([]);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={`Import Clarity history${websiteName ? ` · ${websiteName}` : ''}`} maxWidth="max-w-3xl">
      <div className="space-y-5">
        {/* How to get the files */}
        <div className="flex gap-2 text-xs text-surface-700 bg-brand-50 border border-brand-100 rounded-lg p-3">
          <Info className="w-4 h-4 text-brand-600 flex-shrink-0 mt-0.5" />
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>In Clarity, open this project&apos;s <strong>Dashboard</strong>.</li>
            <li>Set the date range to <strong>one whole month</strong> (e.g. 1–31 Dec 2025).</li>
            <li>
              Click <strong>Download → CSV</strong>, then repeat for each month. Clarity keeps about 13 months.
            </li>
            <li>Drop all the files here at once. Check each file&apos;s month before importing.</li>
          </ol>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors ${
            dragOver ? 'border-brand-400 bg-brand-50' : 'border-surface-200 hover:border-surface-300 bg-surface-50/50'
          }`}
        >
          {previewing ? <Loader2 className="w-6 h-6 animate-spin text-brand-600" /> : <Upload className="w-6 h-6 text-surface-400" />}
          <p className="text-sm text-surface-700 font-medium">{previewing ? 'Reading files…' : 'Drop CSV files here or click to choose'}</p>
          <p className="text-2xs text-surface-400">Up to 24 files, 2 MB each</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {error && (
          <div className="flex gap-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {result && (
          <div className="flex gap-2 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              Imported {result.imported.length} month{result.imported.length === 1 ? '' : 's'}:{' '}
              {result.imported.map((i) => monthLabel(i.month)).join(', ')}.
              {result.replaced > 0 && ` ${result.replaced} replaced an earlier import of the same month.`} Monthly Charts now
              uses these numbers for those months.
            </div>
          </div>
        )}

        {/* Files waiting to be imported */}
        {rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((r) => {
              const p = r.preview || {};
              const found = Object.entries(p.metrics || {}).filter(([, v]) => v !== null && v !== undefined);
              return (
                <div key={r.name} className="rounded-xl border border-surface-200 p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-surface-800 break-all flex-1 min-w-[160px]">{r.name}</span>
                    <label className="flex items-center gap-2 text-xs text-surface-600">
                      Month
                      <input
                        type="month"
                        className={`input py-1 w-40 ${!r.month || duplicateMonths.has(r.month) ? 'input-error' : ''}`}
                        value={r.month}
                        onChange={(e) => setRows((prev) => prev.map((x) => (x.name === r.name ? { ...x, month: e.target.value } : x)))}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setRows((prev) => prev.filter((x) => x.name !== r.name))}
                      className="p-1 text-surface-400 hover:text-rose-600"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {found.length ? (
                      found.map(([k, v]) => (
                        <span key={k} className="badge-gray">
                          {METRIC_LABELS[k] || k}: {formatMetric(k, v)}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-rose-600">No Clarity metrics recognised in this file.</span>
                    )}
                    {p.pagesCount > 0 && <span className="badge-blue">{p.pagesCount} pages</span>}
                  </div>
                  <div className="text-2xs text-surface-400">
                    {p.monthSource === 'content' && `Month read from the dates in the file (${p.dateRange?.start} → ${p.dateRange?.end}).`}
                    {p.monthSource === 'filename' && 'Month guessed from the file name. Please check it.'}
                    {!p.monthSource && 'Month not found in the file. Pick it above.'}
                    {r.month && importedMonths.has(r.month) && (
                      <span className="text-amber-600"> {monthLabel(r.month)} is already imported and will be replaced.</span>
                    )}
                    {r.month && duplicateMonths.has(r.month) && <span className="text-rose-600"> Two files are set to the same month.</span>}
                  </div>
                  {p.warnings?.length > 0 && (
                    <ul className="text-2xs text-amber-700 list-disc ml-4">
                      {p.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-surface-500">
                {ready.length} of {rows.length} file{rows.length === 1 ? '' : 's'} ready
              </span>
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary btn-sm" onClick={reset} disabled={importing}>
                  Clear
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={doImport}
                  disabled={!ready.length || importing || duplicateMonths.size > 0}
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Import {ready.length} month{ready.length === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Already imported */}
        <div>
          <p className="text-xs font-semibold text-surface-600 mb-2">Imported months</p>
          {importsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-surface-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : imports.length === 0 ? (
            <p className="text-xs text-surface-400">Nothing imported yet.</p>
          ) : (
            <div className="border border-surface-200 rounded-xl divide-y divide-surface-100">
              {imports.map((i) => (
                <div key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs">
                  <span className="font-semibold text-surface-800 w-20">{monthLabel(i.month)}</span>
                  <span className="text-surface-600">
                    {formatMetric('sessions', i.metrics?.sessions)} sessions · {formatMetric('distinctUsers', i.metrics?.distinctUsers)} users
                  </span>
                  <span className="text-surface-400 flex-1 truncate" title={i.fileName}>
                    {i.fileName}
                  </span>
                  <button
                    type="button"
                    className="p-1 text-surface-400 hover:text-rose-600"
                    title="Delete this import"
                    onClick={() => {
                      if (window.confirm(`Delete the imported Clarity figures for ${monthLabel(i.month)}?`)) {
                        deleteImport({ workspaceId, websiteId, importId: i.id });
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
