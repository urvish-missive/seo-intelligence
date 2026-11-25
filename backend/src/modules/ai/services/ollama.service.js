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

      // Exact match; a model given without a tag means ":latest"
      const normalise = (name) => {
        const n = String(name).toLowerCase();
        return n.includes(':') ? n : `${n}:latest`;
      };
      const wanted = normalise(targetModel);
      const modelPresent = modelNames.some((m) => normalise(m) === wanted);

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
      logger.error('Ollama chat invocation failed:', { error: err.message, durationMs: Date.now() - startTime });
      throw this.toOllamaError(err, url, model);
    }
  }

  /**
   * Map an axios/Ollama failure to a clear error with an HTTP-ish status.
   */
  toOllamaError(err, url, model) {
    if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
      const error = new Error(`Local Ollama is not running at ${url}. Start it with "ollama serve" and try again.`);
      error.code = 'OLLAMA_UNAVAILABLE';
      error.status = 503;
      error.statusCode = 503;
      error.isOperational = true;
      return error;
    }
    if (err.response?.status === 404) {
      const error = new Error(`Model "${model}" is not installed in Ollama. Run "ollama pull ${model}" or pick an installed model in AI settings.`);
      error.code = 'MODEL_NOT_FOUND';
      error.status = 404;
      error.statusCode = 404;
      error.isOperational = true;
      return error;
    }
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      const error = new Error(`Ollama took longer than ${Math.round(this.timeout / 1000)}s to respond. Try a smaller model or a shorter question.`);
      error.code = 'OLLAMA_TIMEOUT';
      error.status = 504;
      error.statusCode = 504;
      error.isOperational = true;
      return error;
    }
    if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
      const error = new Error('Generation cancelled.');
      error.code = 'CANCELLED';
      error.statusCode = 499;
      error.isOperational = true;
      return error;
    }
    return err;
  }

  /**
   * Streaming Chat Completion.
   * Calls onChunk(chunkText) as tokens arrive from Ollama.
   * Pass options.signal (AbortSignal) to stop generation when the client leaves.
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

    let response;
    try {
      response = await client.post(
        '/api/chat',
        {
          model,
          messages,
          stream: true,
          options: { temperature, num_ctx: numCtx },
        },
        { responseType: 'stream', signal: options.signal }
      );
    } catch (err) {
      throw this.toOllamaError(err, url, model);
    }

    let fullContent = '';
    let promptTokens = 0;
    let evalTokens = 0;
    let finalModel = model;

    return new Promise((resolve, reject) => {
      let buffer = '';
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      const handleLine = (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) return;
        let parsed;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          return; // partial/garbled line
        }
        // Ollama reports failures (e.g. out of memory) as {"error": "..."} lines
        if (parsed.error) {
          const error = new Error(`Ollama error: ${parsed.error}`);
          error.code = 'OLLAMA_ERROR';
          error.statusCode = 502;
          error.isOperational = true;
          fail(error);
          response.data.destroy?.();
          return;
        }
        if (parsed.message?.content) {
          fullContent += parsed.message.content;
          onChunk(parsed.message.content);
        }
        if (parsed.prompt_eval_count) promptTokens = parsed.prompt_eval_count;
        if (parsed.eval_count) evalTokens = parsed.eval_count;
        if (parsed.model) finalModel = parsed.model;
      };

      response.data.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        lines.forEach(handleLine);
      });

      response.data.on('end', () => {
        if (buffer.trim()) handleLine(buffer);
        if (settled) return;
        if (!fullContent.trim()) {
          const error = new Error('The model returned an empty answer. Try rephrasing the question or using a larger model.');
          error.code = 'EMPTY_RESPONSE';
          error.statusCode = 502;
          error.isOperational = true;
          fail(error);
          return;
        }
        settled = true;
        resolve({
          content: fullContent,
          tokensUsed: promptTokens + evalTokens,
          durationMs: Date.now() - startTime,
          model: finalModel,
        });
      });

      response.data.on('error', (err) => fail(this.toOllamaError(err, url, model)));
    });
  }
}

export const ollamaService = new OllamaService();
