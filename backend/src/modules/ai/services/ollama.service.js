// backend/src/modules/ai/services/ollama.service.js
// Ollama HTTP service client for local LLM inference.
// Supports health checks, model catalog, chat completion, and SSE streaming.

import axios from 'axios';
import { OLLAMA_DEFAULTS } from '../config/ollama.config.js';
import logger from '../../../utils/logger.js';

export class OllamaService {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || OLLAMA_DEFAULTS.BASE_URL;
    this.model = config.model || OLLAMA_DEFAULTS.MODEL;
    this.timeout = config.timeout || OLLAMA_DEFAULTS.TIMEOUT_MS;
    this.temperature = config.temperature ?? OLLAMA_DEFAULTS.TEMPERATURE;
    this.numCtx = config.numCtx || OLLAMA_DEFAULTS.NUM_CTX;
  }

  /**
   * Helper to create an axios client for a given base URL.
   */
  getClient(customUrl = null) {
    return axios.create({
      baseURL: customUrl || this.baseUrl,
      timeout: this.timeout,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Check Ollama connectivity and presence of target model.
   * @param {string} [customUrl] - Optional URL override
   * @param {string} [customModel] - Optional model name override
   * @returns {Promise<{ available: boolean, modelPresent: boolean, models: string[], message: string, activeModel: string }>}
   */
  async checkHealth(customUrl = null, customModel = null) {
    const url = customUrl || this.baseUrl;
    const targetModel = customModel || this.model;

    try {
      const client = this.getClient(url);
      const res = await client.get('/api/tags', { timeout: 5000 });
      const rawModels = res.data?.models || [];
      const modelNames = rawModels.map(m => m.name);

      // Check if target model or its prefix matches
      const baseName = targetModel.split(':')[0].toLowerCase();
      const modelPresent = modelNames.some(m =>
        m.toLowerCase() === targetModel.toLowerCase() ||
        m.toLowerCase().startsWith(baseName)
      );

      return {
        available: true,
        modelPresent,
        models: modelNames,
        activeModel: targetModel,
        message: modelPresent
          ? `Ollama is active and model "${targetModel}" is available.`
          : `Ollama is active, but model "${targetModel}" is not installed. Run: "ollama pull ${targetModel}".`,
      };
    } catch (err) {
      return {
        available: false,
        modelPresent: false,
        models: [],
        activeModel: targetModel,
        message: `Ollama is not reachable at ${url}. Please ensure Ollama is installed and running. Command: "ollama serve"`,
        error: err.message,
      };
    }
  }

  /**
   * List installed models from the local Ollama instance.
   */
  async listModels(customUrl = null) {
    try {
      const client = this.getClient(customUrl);
      const res = await client.get('/api/tags', { timeout: 10000 });
      return res.data?.models || [];
    } catch (err) {
      logger.warn('Failed to retrieve Ollama models:', { error: err.message });
      return [];
    }
  }

  /**
   * Get metadata for a specific model.
   */
  async showModel(modelName = null, customUrl = null) {
    const targetModel = modelName || this.model;
    try {
      const client = this.getClient(customUrl);
      const res = await client.post('/api/show', { name: targetModel }, { timeout: 10000 });
      return res.data;
    } catch (err) {
      logger.warn(`Failed to inspect model ${targetModel}:`, { error: err.message });
      return null;
    }
  }

  /**
   * Non-streaming Chat Completion.
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options]
   * @returns {Promise<{ content: string, tokensUsed: number, durationMs: number, model: string }>}
   */
  async chat(messages, options = {}) {
    const startTime = Date.now();
    const url = options.baseUrl || this.baseUrl;
    const model = options.model || this.model;
    const temperature = options.temperature ?? this.temperature;
    const numCtx = options.numCtx || this.numCtx;

    const client = this.getClient(url);

    try {
      const response = await client.post('/api/chat', {
        model,
        messages,
        stream: false,
        options: {
          temperature,
          num_ctx: numCtx,
        },
      });

      const durationMs = Date.now() - startTime;
      const data = response.data || {};
      const content = data.message?.content || '';
      const promptTokens = data.prompt_eval_count || 0;
      const evalTokens = data.eval_count || 0;
      const tokensUsed = promptTokens + evalTokens;

      return {
        content,
        tokensUsed,
        durationMs,
        model: data.model || model,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        const error = new Error(`Local Ollama service is offline at ${url}. Please start Ollama before chatting.`);
        error.code = 'OLLAMA_UNAVAILABLE';
        error.status = 503;
        throw error;
      }
      if (err.response?.status === 404 || err.message?.includes('not found')) {
        const error = new Error(`Model "${model}" not found in local Ollama. Please run "ollama pull ${model}" to install it.`);
        error.code = 'MODEL_NOT_FOUND';
        error.status = 404;
        throw error;
      }

      logger.error('Ollama chat invocation failed:', { error: err.message, durationMs });
      throw err;
    }
  }

  /**
   * Streaming Chat Completion.
   * Calls onChunk(chunkText) as tokens arrive from Ollama.
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} options
   * @param {Function} onChunk
   * @returns {Promise<{ content: string, tokensUsed: number, durationMs: number, model: string }>}
   */
  async streamChat(messages, options = {}, onChunk = () => {}) {
    const startTime = Date.now();
    const url = options.baseUrl || this.baseUrl;
    const model = options.model || this.model;
    const temperature = options.temperature ?? this.temperature;
    const numCtx = options.numCtx || this.numCtx;

    const client = this.getClient(url);

    try {
      const response = await client.post(
        '/api/chat',
        {
          model,
          messages,
          stream: true,
          options: {
            temperature,
            num_ctx: numCtx,
          },
        },
        {
          responseType: 'stream',
        }
      );

      let fullContent = '';
      let promptTokens = 0;
      let evalTokens = 0;
      let finalModel = model;

      return new Promise((resolve, reject) => {
        let buffer = '';

        response.data.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep partial line

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.message?.content) {
                fullContent += parsed.message.content;
                onChunk(parsed.message.content);
              }
              if (parsed.prompt_eval_count) promptTokens = parsed.prompt_eval_count;
              if (parsed.eval_count) evalTokens = parsed.eval_count;
              if (parsed.model) finalModel = parsed.model;
            } catch (jsonErr) {
              // Ignore line parse glitches
            }
          }
        });

        response.data.on('end', () => {
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer.trim());
              if (parsed.message?.content) {
                fullContent += parsed.message.content;
                onChunk(parsed.message.content);
              }
              if (parsed.prompt_eval_count) promptTokens = parsed.prompt_eval_count;
              if (parsed.eval_count) evalTokens = parsed.eval_count;
            } catch {
              // ignore
            }
          }

          const durationMs = Date.now() - startTime;
          resolve({
            content: fullContent,
            tokensUsed: promptTokens + evalTokens,
            durationMs,
            model: finalModel,
          });
        });

        response.data.on('error', (err) => {
          reject(err);
        });
      });
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        const error = new Error(`Local Ollama service is offline at ${url}.`);
        error.code = 'OLLAMA_UNAVAILABLE';
        error.status = 503;
        throw error;
      }
      throw err;
    }
  }
}

export const ollamaService = new OllamaService();
