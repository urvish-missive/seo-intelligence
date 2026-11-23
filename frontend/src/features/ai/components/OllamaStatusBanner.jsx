// frontend/src/features/ai/components/OllamaStatusBanner.jsx
import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Copy, Check, Terminal, ExternalLink } from 'lucide-react';

export default function OllamaStatusBanner({ health, isLoading }) {
  const [copiedCmd, setCopiedCmd] = useState('');

  if (isLoading || !health) return null;

  const copyToClipboard = (text, key) => {
    navigator.clipboard?.writeText(text);
    setCopiedCmd(key);
    setTimeout(() => setCopiedCmd(''), 2500);
  };

  // Case 1: Ollama is completely offline
  if (!health.available) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-3 text-sm text-red-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">Local Ollama AI Engine Offline</p>
              <p className="text-xs text-red-700 mt-0.5">
                The AI assistant requires Ollama running locally. No data leaves your machine.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-red-100/80 px-2.5 py-1 rounded border border-red-300 font-mono text-xs text-red-900">
              <Terminal className="w-3.5 h-3.5 text-red-700" />
              <span>ollama serve</span>
              <button
                type="button"
                onClick={() => copyToClipboard('ollama serve', 'serve')}
                className="ml-1 text-red-600 hover:text-red-900 focus:outline-none"
                title="Copy command"
              >
                {copiedCmd === 'serve' ? <Check className="w-3.5 h-3.5 text-green-700" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900 underline ml-2"
            >
              Download Ollama <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: Ollama is running, but the specified model is not downloaded
  if (health.available && !health.modelPresent) {
    const pullCmd = `ollama pull ${health.activeModel || 'qwen2.5:7b'}`;
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-sm text-amber-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900">Model "{health.activeModel}" Not Installed</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Ollama is connected, but the SEO reasoning model must be pulled locally.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-amber-100 px-2.5 py-1 rounded border border-amber-300 font-mono text-xs text-amber-900">
              <Terminal className="w-3.5 h-3.5 text-amber-700" />
              <span>{pullCmd}</span>
              <button
                type="button"
                onClick={() => copyToClipboard(pullCmd, 'pull')}
                className="ml-1 text-amber-700 hover:text-amber-950 focus:outline-none"
                title="Copy command"
              >
                {copiedCmd === 'pull' ? <Check className="w-3.5 h-3.5 text-green-700" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
