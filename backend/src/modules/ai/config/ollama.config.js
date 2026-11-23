// backend/src/modules/ai/config/ollama.config.js
// Default configuration for local Ollama AI engine.

import { env } from '../../../config/environment.js';

export const OLLAMA_DEFAULTS = {
  BASE_URL: env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
  MODEL: env.OLLAMA_MODEL || 'qwen2.5:7b',
  TIMEOUT_MS: env.OLLAMA_TIMEOUT_MS || 120000,
  MAX_CONTEXT_TOKENS: env.OLLAMA_MAX_CONTEXT_TOKENS || 8000,
  TEMPERATURE: 0.3,
  NUM_CTX: 8192,
};

export const SUPPORTED_MODELS = [
  { id: 'qwen2.5:7b', name: 'Qwen 2.5 (7B) - Recommended', family: 'qwen', recommended: true },
  { id: 'qwen2.5:14b', name: 'Qwen 2.5 (14B) - High Quality', family: 'qwen', recommended: false },
  { id: 'qwen2.5:3b', name: 'Qwen 2.5 (3B) - Fast & Lightweight', family: 'qwen', recommended: false },
  { id: 'llama3.1:8b', name: 'Llama 3.1 (8B)', family: 'llama', recommended: false },
];
