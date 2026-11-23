// ai-engine/src/ollama/client.js
// Ollama HTTP client — connects to local Ollama instance.

import axios from 'axios';

export class OllamaClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
    this.model = config.model || process.env.OLLAMA_MODEL || 'qwen2.5:7b';
    this.timeout = config.timeout || parseInt(process.env.OLLAMA_TIMEOUT_MS || '120000', 10);
    this.temperature = config.temperature || 0.3;

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Chat with the model — returns full response content.
   * @param {Array} messages - Array of {role, content} objects
   * @param {object} options - Additional options
   * @returns {Promise<string>} - Model response text
   */
  async chat(messages, options = {}) {
    const response = await this.http.post('/api/chat', {
      model: options.model || this.model,
      messages,
      stream: false,
      options: {
        temperature: options.temperature || this.temperature,
        num_ctx: options.numCtx || 8192,
      },
    });

    return response.data?.message?.content || '';
  }

  /**
   * Generate a completion — simpler than chat.
   * @param {string} prompt
   * @param {object} options
   */
  async generate(prompt, options = {}) {
    const response = await this.http.post('/api/generate', {
      model: options.model || this.model,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature || this.temperature,
      },
    });

    return response.data?.response || '';
  }

  /**
   * List available models on this Ollama instance.
   */
  async listModels() {
    const response = await this.http.get('/api/tags');
    return response.data?.models || [];
  }

  /**
   * Check if a specific model is available.
   */
  async hasModel(modelName) {
    const models = await this.listModels();
    const baseName = modelName.split(':')[0];
    return models.some(m => m.name.startsWith(baseName));
  }
}

export default OllamaClient;
