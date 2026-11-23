// ai-engine/src/ollama/health.js
// Model health check — used at startup and by the /health/detailed endpoint.

import axios from 'axios';

/**
 * Check Ollama availability and model presence.
 * @param {string} baseUrl - Ollama base URL
 * @param {string} modelName - Model to check for
 * @returns {Promise<{available: boolean, modelPresent: boolean, models: string[], message: string}>}
 */
export async function checkModelHealth(
  baseUrl = 'http://127.0.0.1:11434',
  modelName = 'qwen2.5:7b'
) {
  try {
    const response = await axios.get(`${baseUrl}/api/tags`, { timeout: 5000 });
    const models = response.data?.models?.map(m => m.name) || [];
    const baseName = modelName.split(':')[0];
    const modelPresent = models.some(m => m.startsWith(baseName));

    return {
      available: true,
      modelPresent,
      models,
      message: modelPresent
        ? `Ollama running — model ${modelName} available`
        : `Ollama running but model "${modelName}" not found. Run: ollama pull ${modelName}`,
    };
  } catch (err) {
    return {
      available: false,
      modelPresent: false,
      models: [],
      message: `Ollama not reachable at ${baseUrl}. Install from https://ollama.com/download then run: ollama pull ${modelName}`,
    };
  }
}
