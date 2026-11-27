// frontend/src/features/integrations/components/ClarityCsvImportModal.jsx
// Bulk upload of Microsoft Clarity dashboard CSV downloads, one per month.
//
// Clarity's API only returns the last 3 days, but its dashboard keeps about
// 13 months and can be downloaded as CSV. Each file is checked first (preview),
// you confirm the month, then the whole batch is saved in one go.

import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, FolderOpen, Trash2, Loader2, CheckCircle2, AlertTriangle, X, Info } from 'lucide-react';
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
const MAX_FILES = 120; // 10 years of monthly downloads
const BATCH_SIZE = 20;
const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

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

/**
 * Files from a drag-and-drop, including everything inside dropped folders.
 * Entries must be read before the first await: the browser clears the
 * DataTransfer once the drop event has finished.
 */
async function filesFromDrop(dataTransfer) {
  const entries = [...(dataTransfer.items || [])].map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...(dataTransfer.files || [])];
  const out = [];
  const walk = async (entry) => {
    if (entry.isFile) {
      out.push(await new Promise((resolve, reject) => entry.file(resolve, reject)));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        for (const child of batch) await walk(child);
      } while (batch.length);
    }
  };
  for (const entry of entries) await walk(entry);
  return out;
}

function errorText(err) {
  return err?.data?.error?.message || err?.data?.message || err?.message || 'Something went wrong.';
}

/** The upload, preview and imported-months list, usable inside any dialog. */
export function ClarityCsvImporter({ workspaceId, websiteId }) {
  const inputRef = useRef(null);
  const folderRef = useRef(null);
  const [notice, setNotice] = useState(null);
  const [rows, setRows] = useState([]); // { name, content, preview, month }
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [previewCsv, { isLoading: previewing }] = usePreviewClarityCsvMutation();
  const [importCsv, { isLoading: importing }] = useImportClarityCsvMutation();
  const [deleteImport] = useDeleteClarityCsvImportMutation();
  const importsQuery = useGetClarityCsvImportsQuery({ workspaceId, websiteId }, { skip: !websiteId });
  const imports = importsQuery.data?.data?.imports || [];
  const importedMonths = new Set(imports.map((i) => i.month));

  const reset = () => {
    setRows([]);
    setResult(null);
    setError(null);
    setNotice(null);
  };

  const addFiles = async (fileList) => {
    setError(null);
    setResult(null);
    setNotice(null);
    const all = [...(fileList || [])];
    const csvs = all.filter((f) => /\.csv$/i.test(f.name));
    const notCsv = all.length - csvs.length;
    const tooBig = csvs.filter((f) => f.size > MAX_FILE_BYTES);
    const files = csvs.filter((f) => f.size <= MAX_FILE_BYTES);
    if (!files.length) {
      setError(
        tooBig.length
          ? `${tooBig.map((f) => f.name).join(', ')} ${tooBig.length === 1 ? 'is' : 'are'} larger than 2 MB.`
          : 'No .csv files found. Choose the CSV files downloaded from the Clarity dashboard.'
      );
      return;
    }
    const newNames = new Set(files.map((f) => f.name));
    const keptCount = rows.filter((r) => !newNames.has(r.name)).length;
    if (files.length + keptCount > MAX_FILES) {
      setError(`That's ${files.length + keptCount} files. Add up to ${MAX_FILES} at a time.`);
      return;
    }
    const skipped = [
      notCsv && `${notCsv} non-CSV file${notCsv === 1 ? '' : 's'}`,
      tooBig.length && `${tooBig.length} file${tooBig.length === 1 ? '' : 's'} over 2 MB`,
    ].filter(Boolean);
    setNotice(`Added ${files.length} file${files.length === 1 ? '' : 's'}.${skipped.length ? ` Skipped ${skipped.join(' and ')}.` : ''}`);
    const read = await Promise.all(files.map(async (f) => ({ name: f.name, content: await f.text() })));
    try {
      // Sent in batches so a large upload stays under the server's request size limit
      const previews = [];
      for (const batch of chunk(read, BATCH_SIZE)) {
        const res = await previewCsv({ workspaceId, websiteId, files: batch }).unwrap();
        previews.push(...res.data.files);
      }
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

  // Months each file will create: one, or many for a file with dated rows
  const monthsOf = (r) => (r.preview?.split?.length ? r.preview.split.map((s) => s.month) : r.month ? [r.month] : []);
  const ready = rows.filter(
    (r) => !r.preview?.errors?.length && (r.preview?.split?.length > 0 || (r.month && r.preview?.metricsFound > 0))
  );
  const readyMonthCount = ready.reduce((acc, r) => acc + monthsOf(r).length, 0);
  const duplicateMonths = (() => {
    const seen = new Map();
    rows.forEach((r) => monthsOf(r).forEach((m) => seen.set(m, (seen.get(m) || 0) + 1)));
    return new Set([...seen].filter(([, n]) => n > 1).map(([m]) => m));
  })();

  const doImport = async () => {
    setError(null);
    // Duplicate months are already blocked in the preview, so batches can't clash
    const done = { imported: [], replaced: 0 };
    const importedNames = new Set();
    try {
      for (const batch of chunk(ready, BATCH_SIZE)) {
        const res = await importCsv({
          workspaceId,
          websiteId,
          files: batch.map((r) => ({ name: r.name, content: r.content, month: r.month })),
        }).unwrap();
        done.imported.push(...res.data.imported);
        done.replaced += res.data.replaced;
        batch.forEach((r) => importedNames.add(r.name));
      }
      done.imported.sort((a, b) => a.month.localeCompare(b.month));
      setResult(done);
      setRows([]);
    } catch (e) {
      // Keep only the files that weren't saved yet, so a retry doesn't redo them
      if (done.imported.length) {
        setResult(done);
        setRows((prev) => prev.filter((r) => !importedNames.has(r.name)));
      }
      setError(errorText(e));
    }
  };

  return (
      <div className="space-y-5">
        {/* How to get the files */}
        <div className="flex gap-2 text-xs text-surface-700 bg-brand-50 border border-brand-100 rounded-lg p-3">
          <Info className="w-4 h-4 text-brand-600 flex-shrink-0 mt-0.5" />
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>In Clarity, open this project&apos;s <strong>Dashboard</strong>.</li>
            <li>
              Set the date range to <strong>one whole month</strong> (e.g. 1–31 Dec 2025). A longer range downloads as one
              total, which can&apos;t be split into months.
            </li>
            <li>
              Click <strong>Download → CSV</strong>, then repeat for each month. Clarity keeps about 13 months.
            </li>
            <li>Drop all the files here at once. Check each file&apos;s month before importing.</li>
          </ol>
        </div>

        {/* Drop zone: many files at once, or a whole folder */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(await filesFromDrop(e.dataTransfer));
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors ${
            dragOver ? 'border-brand-400 bg-brand-50' : 'border-surface-200 hover:border-surface-300 bg-surface-50/50'
          }`}
        >
          {previewing ? <Loader2 className="w-6 h-6 animate-spin text-brand-600" /> : <Upload className="w-6 h-6 text-surface-400" />}
          <p className="text-sm text-surface-700 font-medium">
            {previewing ? 'Reading files…' : 'Drop all your monthly CSV files (or a folder) here'}
          </p>
          <div className="flex flex-wrap justify-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()} disabled={previewing}>
              <FileSpreadsheet className="w-4 h-4" />
              Choose files
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => folderRef.current?.click()} disabled={previewing}>
              <FolderOpen className="w-4 h-4" />
              Choose folder
            </button>
          </div>
          <p className="text-2xs text-surface-400">
            Select several files at once with Ctrl or Shift. Up to {MAX_FILES} files (10 years), 2 MB each.
          </p>
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
          <input
            ref={(el) => {
              folderRef.current = el;
              // Folder picking isn't a standard React prop
              if (el) {
                el.setAttribute('webkitdirectory', '');
                el.setAttribute('directory', '');
              }
            }}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {notice && (
          <div className="flex gap-2 text-xs text-surface-700 bg-surface-50 border border-surface-200 rounded-lg p-3">
            <Info className="w-4 h-4 text-brand-600 flex-shrink-0 mt-0.5" />
            {notice}
          </div>
        )}

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
                <div
                  key={r.name}
                  className={`rounded-xl border p-3 space-y-2 ${p.errors?.length ? 'border-rose-200 bg-rose-50/40' : 'border-surface-200'}`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <FileSpreadsheet className={`w-4 h-4 flex-shrink-0 ${p.errors?.length ? 'text-rose-500' : 'text-emerald-600'}`} />
                    <span className="text-sm font-medium text-surface-800 break-all flex-1 min-w-[160px]">{r.name}</span>
                    {p.split?.length > 0 && (
                      <span className="badge-blue">
                        Splits into {p.split.length} months
                      </span>
                    )}
                    {!p.errors?.length && !p.split?.length && (
                      <label className="flex items-center gap-2 text-xs text-surface-600">
                        Month
                        <input
                          type="month"
                          className={`input py-1 w-40 ${!r.month || duplicateMonths.has(r.month) ? 'input-error' : ''}`}
                          value={r.month}
                          // A month read from the file's own date range can't be changed
                          disabled={p.monthSource === 'content'}
                          title={p.monthSource === 'content' ? 'Taken from the date range inside the file' : undefined}
                          onChange={(e) => setRows((prev) => prev.map((x) => (x.name === r.name ? { ...x, month: e.target.value } : x)))}
                        />
                      </label>
                    )}
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
                  {p.split?.length > 0 && (
                    <div className="border border-surface-200 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-surface-50 text-2xs text-surface-500 uppercase tracking-wider">
                          <tr>
                            <th className="text-left font-semibold px-3 py-1.5">Month</th>
                            <th className="text-right font-semibold px-3 py-1.5">Sessions</th>
                            <th className="text-right font-semibold px-3 py-1.5">Users</th>
                            <th className="text-right font-semibold px-3 py-1.5">Days in file</th>
                            <th className="px-3 py-1.5" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-100">
                          {p.split.map((s) => (
                            <tr key={s.month}>
                              <td className="px-3 py-1.5 font-medium text-surface-800">{monthLabel(s.month)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{formatMetric('sessions', s.metrics.sessions)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{formatMetric('distinctUsers', s.metrics.distinctUsers)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-surface-500">
                                {s.days}/{s.expectedDays}
                              </td>
                              <td className="px-3 py-1.5 text-right text-2xs">
                                {s.partial && <span className="text-amber-600">Partial</span>}
                                {importedMonths.has(s.month) && <span className="text-amber-600"> Replaces existing</span>}
                                {duplicateMonths.has(s.month) && <span className="text-rose-600"> Also in another file</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="text-2xs text-surface-400">
                    {p.monthSource === 'rows' && `One file, ${p.split.length} months: split using the date on each row (${p.dateRange?.start} → ${p.dateRange?.end}).`}
                    {p.monthSource === 'content' && `Month taken from the file's date range (${p.dateRange?.start} → ${p.dateRange?.end}).`}
                    {p.monthSource === 'filename' && 'Month guessed from the file name. Please check it.'}
                    {!p.monthSource && !p.errors?.length && 'Month not found in the file. Pick it above.'}
                    {r.month && importedMonths.has(r.month) && (
                      <span className="text-amber-600"> {monthLabel(r.month)} is already imported and will be replaced.</span>
                    )}
                    {r.month && duplicateMonths.has(r.month) && <span className="text-rose-600"> Two files are set to the same month.</span>}
                  </div>
                  {p.errors?.length > 0 && (
                    <div className="flex gap-2 text-xs text-rose-800">
                      <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                      <div>
                        <strong>Can&apos;t import this file.</strong> {p.errors.join(' ')}
                      </div>
                    </div>
                  )}
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
                  Import {readyMonthCount} month{readyMonthCount === 1 ? '' : 's'}
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
                    {i.notUsed ? (
                      <span className="text-rose-600 font-medium">
                        Not used: this file covers {i.dateRange?.start} to {i.dateRange?.end}, not one month. Delete it.
                      </span>
                    ) : (
                      i.fileName
                    )}
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
  );
}

export default function ClarityCsvImportModal({ isOpen, onClose, workspaceId, websiteId, websiteName }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Import Clarity history${websiteName ? ` · ${websiteName}` : ''}`} maxWidth="max-w-3xl">
      <ClarityCsvImporter workspaceId={workspaceId} websiteId={websiteId} />
    </Modal>
  );
}
