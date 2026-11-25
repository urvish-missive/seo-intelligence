// frontend/src/features/ai/components/ModelPicker.jsx
// Shows the active Ollama model with a health dot, and lets workspace admins
// switch between installed models. The choice is saved to the workspace AI
// settings, which chat, streaming and Executive Audit all use.
import React, { useState } from 'react';
import { Cpu, Loader2 } from 'lucide-react';
import { useGetAiModelsQuery, useUpdateAiConfigMutation } from '../aiApi.js';

function describeModel(m) {
  const size = m.details?.parameter_size; // e.g. "3.1B"
  const billions = parseFloat(size);
  const hint = Number.isFinite(billions) ? (billions <= 4 ? 'faster' : 'more accurate') : '';
  return [m.name, size && `(${size}${hint ? `, ${hint}` : ''})`].filter(Boolean).join(' ');
}

export default function ModelPicker({ workspaceId, health, canManage, disabled }) {
  const [error, setError] = useState(null);
  const { data: modelsRes } = useGetAiModelsQuery(workspaceId, { skip: !workspaceId });
  const [updateConfig, { isLoading: isSaving }] = useUpdateAiConfigMutation();

  const models = modelsRes?.data?.models || [];
  const active = health?.activeModel || '';
  const isReady = health?.available && health?.modelPresent;

  const dot = isReady ? 'bg-emerald-500' : health?.available ? 'bg-amber-500' : 'bg-rose-500';
  const tone = isReady
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : health?.available
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-rose-50 text-rose-700 border-rose-200';

  const handleChange = async (modelName) => {
    if (!modelName || modelName === active) return;
    setError(null);
    try {
      await updateConfig({ workspaceId, modelName }).unwrap();
    } catch (err) {
      setError(err?.data?.message || 'Could not change the model.');
    }
  };

  // Read-only pill when the user cannot change settings or Ollama lists nothing
  if (!canManage || models.length === 0) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-3xs font-medium border flex-shrink-0 ${tone}`}
        title={
          !canManage
            ? `${health?.message || ''} Only workspace admins can change the model.`.trim()
            : health?.message || 'Checking Ollama…'
        }
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className="font-mono">{active || '…'}</span>
      </div>
    );
  }

  // Keep the configured model visible even if it is not installed
  const options = models.some((m) => m.name === active) || !active ? models : [{ name: active, missing: true }, ...models];

  return (
    <div className="relative flex-shrink-0">
      <label
        className={`flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full text-3xs font-medium border ${tone}`}
        title={error || health?.message || 'AI model used for answers'}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cpu className="w-3 h-3 opacity-70" />}
        <select
          value={active}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled || isSaving}
          className="bg-transparent font-mono text-3xs focus:outline-none cursor-pointer disabled:cursor-not-allowed max-w-[9rem] sm:max-w-[14rem]"
          aria-label="AI model"
        >
          {options.map((m) => (
            <option key={m.name} value={m.name}>
              {m.missing ? `${m.name} (not installed)` : describeModel(m)}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <div className="absolute right-0 top-full mt-1 w-64 z-10 p-2 rounded-md border border-rose-200 bg-rose-50 text-3xs text-rose-700 shadow-xs">
          {error}
        </div>
      )}
    </div>
  );
}
