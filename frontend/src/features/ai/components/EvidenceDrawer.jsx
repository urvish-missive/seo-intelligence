// frontend/src/features/ai/components/EvidenceDrawer.jsx
import React, { useState } from 'react';
import { Database, ChevronDown, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';

export default function EvidenceDrawer({ evidence }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!evidence) return null;

  const {
    domain,
    client,
    intent,
    hasGA4,
    hasGSC,
    hasClarity,
    findingsCount,
    criticalFindings,
  } = evidence;

  return (
    <div className="mt-3 text-xs bg-surface-50 border border-surface-200 rounded-lg overflow-hidden transition-all">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-surface-600 hover:text-surface-900 hover:bg-surface-100/70 transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Database className="w-3.5 h-3.5 text-brand-500" />
          <span className="font-semibold text-surface-700">Evidence Sources Consulted</span>
          <span className="text-surface-400">|</span>
          <span className="text-surface-600">{domain || 'Website Context'}</span>
          <div className="flex items-center gap-1.5 ml-2">
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-3xs font-medium ${hasGA4 ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-200 text-surface-600'}`}>
              GA4
            </span>
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-3xs font-medium ${hasGSC ? 'bg-sky-100 text-sky-800' : 'bg-surface-200 text-surface-600'}`}>
              GSC
            </span>
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-3xs font-medium ${hasClarity ? 'bg-indigo-100 text-indigo-800' : 'bg-surface-200 text-surface-600'}`}>
              Clarity
            </span>
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-3xs font-medium bg-amber-100 text-amber-800">
              {findingsCount} Findings
            </span>
          </div>
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4 text-surface-400" /> : <ChevronRight className="w-4 h-4 text-surface-400" />}
      </button>

      {isOpen && (
        <div className="px-3.5 py-2.5 border-t border-surface-200 bg-white space-y-2 text-surface-700">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-2xs">
            <div className="p-2 bg-surface-50 rounded border border-surface-100">
              <span className="text-surface-400 block font-medium">Classified Intent</span>
              <span className="font-semibold text-surface-900">{intent || 'GENERAL'}</span>
            </div>
            <div className="p-2 bg-surface-50 rounded border border-surface-100">
              <span className="text-surface-400 block font-medium">Client Account</span>
              <span className="font-semibold text-surface-900 truncate">{client || 'N/A'}</span>
            </div>
            <div className="p-2 bg-surface-50 rounded border border-surface-100">
              <span className="text-surface-400 block font-medium">Open Findings</span>
              <span className="font-semibold text-surface-900">{findingsCount} ({criticalFindings} Critical)</span>
            </div>
            <div className="p-2 bg-surface-50 rounded border border-surface-100">
              <span className="text-surface-400 block font-medium">Storage Medium</span>
              <span className="font-semibold text-surface-900">Local MySQL DB</span>
            </div>
          </div>
          <p className="text-3xs text-surface-400 italic">
            All reasoning executed locally via Ollama with strict data isolation. No credentials or external APIs used.
          </p>
        </div>
      )}
    </div>
  );
}
