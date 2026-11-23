// backend/tests/unit/ai-ollama.test.js
// Unit tests for Ollama Service client: health, models, chat, streaming, and error handling.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { OllamaService } from '../../src/modules/ai/services/ollama.service.js';
import axios from 'axios';
import { EventEmitter } from 'events';

describe('Local Ollama AI Service Tests', () => {
  let ollamaService;

  beforeEach(() => {
    jest.clearAllMocks();
    ollamaService = new OllamaService({
      baseUrl: 'http://127.0.0.1:11434',
      model: 'qwen2.5:7b',
      timeout: 5000,
      temperature: 0.3,
    });
  });

  describe('Health Checks', () => {
    it('should return available: true and modelPresent: true when target model is installed', async () => {
      const mockClient = {
        get: jest.fn().mockResolvedValue({
          data: {
            models: [
              { name: 'qwen2.5:7b', size: 5000000000 },
              { name: 'llama3:latest', size: 4000000000 },
            ],
          },
        }),
      };
      jest.spyOn(ollamaService, 'getClient').mockReturnValue(mockClient);

      const health = await ollamaService.checkHealth();
      expect(health.available).toBe(true);
      expect(health.modelPresent).toBe(true);
      expect(health.models).toContain('qwen2.5:7b');
      expect(health.activeModel).toBe('qwen2.5:7b');
      expect(health.message).toContain('is available');
    });

    it('should return available: true and modelPresent: false when target model is missing', async () => {
      const mockClient = {
        get: jest.fn().mockResolvedValue({
          data: {
            models: [{ name: 'mistral:7b', size: 4000000000 }],
          },
        }),
      };
      jest.spyOn(ollamaService, 'getClient').mockReturnValue(mockClient);

      const health = await ollamaService.checkHealth('http://127.0.0.1:11434', 'qwen2.5:7b');
      expect(health.available).toBe(true);
      expect(health.modelPresent).toBe(false);
      expect(health.models).toEqual(['mistral:7b']);
      expect(health.message).toContain('ollama pull qwen2.5:7b');
    });

    it('should return available: false with actionable error message when Ollama is offline', async () => {
      const mockClient = {
        get: jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434')),
      };
      jest.spyOn(ollamaService, 'getClient').mockReturnValue(mockClient);

      const health = await ollamaService.checkHealth();
      expect(health.available).toBe(false);
      expect(health.modelPresent).toBe(false);
      expect(health.models).toEqual([]);
      expect(health.message).toContain('Ollama is not reachable');
    });
  });

  describe('Model Listing and Inspection', () => {
    it('should list installed models', async () => {
      const mockClient = {
        get: jest.fn().mockResolvedValue({
          data: {
            models: [{ name: 'qwen2.5:7b' }, { name: 'qwen2.5:14b' }],
          },
        }),
      };
      jest.spyOn(ollamaService, 'getClient').mockReturnValue(mockClient);

      const models = await ollamaService.listModels();
      expect(models).toHaveLength(2);
      expect(models[0].name).toBe('qwen2.5:7b');
    });

    it('should show model details', async () => {
      const mockClient = {
        post: jest.fn().mockResolvedValue({
          data: {
            modelfile: 'FROM qwen2.5:7b\nSYSTEM ...',
            parameters: 'temperature 0.3',
          },
        }),
      };
      jest.spyOn(ollamaService, 'getClient').mockReturnValue(mockClient);

      const details = await ollamaService.showModel('qwen2.5:7b');
      expect(details).toHaveProperty('modelfile');
      expect(details).toHaveProperty('parameters');
    });
  });

  describe('Chat Completion', () => {
    it('should execute chat completion, returning content, tokens, and duration', async () => {
      const mockClient = {
        post: jest.fn().mockResolvedValue({
          data: {
            model: 'qwen2.5:7b',
            message: { role: 'assistant', content: 'SEO performance summary: traffic grew 12%.' },
            prompt_eval_count: 150,
            eval_count: 45,
          },
        }),
      };
      jest.spyOn(ollamaService, 'getClient').mockReturnValue(mockClient);

      const messages = [
        { role: 'system', content: 'You are an SEO analyst.' },
        { role: 'user', content: 'Summarise organic performance.' },
      ];

      const res = await ollamaService.chat(messages);
      expect(res.content).toBe('SEO performance summary: traffic grew 12%.');
      expect(res.tokensUsed).toBe(195);
      expect(res.durationMs).toBeGreaterThanOrEqual(0);
      expect(res.model).toBe('qwen2.5:7b');
    });

    it('should map ECONNREFUSED to OLLAMA_UNAVAILABLE with status 503', async () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:11434');
      err.code = 'ECONNREFUSED';
      const mockClient = {
        post: jest.fn().mockRejectedValue(err),
      };
      jest.spyOn(ollamaService, 'getClient').mockReturnValue(mockClient);

      await expect(ollamaService.chat([{ role: 'user', content: 'Hi' }])).rejects.toMatchObject({
        code: 'OLLAMA_UNAVAILABLE',
        status: 503,
      });
    });

    it('should map missing model 404 to MODEL_NOT_FOUND with status 404', async () => {
      const err = new Error('model "qwen2.5:7b" not found');
      err.response = { status: 404 };
      const mockClient = {
        post: jest.fn().mockRejectedValue(err),
      };
      jest.spyOn(ollamaService, 'getClient').mockReturnValue(mockClient);

      await expect(ollamaService.chat([{ role: 'user', content: 'Hi' }])).rejects.toMatchObject({
        code: 'MODEL_NOT_FOUND',
        status: 404,
      });
    });
  });

  describe('Streaming Chat', () => {
    it('should parse NDJSON chunks, emit tokens to callback, and resolve full text', async () => {
      const streamEmitter = new EventEmitter();
      const mockClient = {
        post: jest.fn().mockResolvedValue({
          data: streamEmitter,
        }),
      };
      jest.spyOn(ollamaService, 'getClient').mockReturnValue(mockClient);

      const receivedTokens = [];
      const streamPromise = ollamaService.streamChat(
        [{ role: 'user', content: 'Explain CTR' }],
        {},
        (tok) => receivedTokens.push(tok)
      );

      // Emit simulated chunks asynchronously after event listeners attach
      setImmediate(() => {
        streamEmitter.emit('data', Buffer.from(JSON.stringify({ message: { content: 'Click ' } }) + '\n'));
        streamEmitter.emit('data', Buffer.from(JSON.stringify({ message: { content: 'Through ' } }) + '\n'));
        streamEmitter.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              message: { content: 'Rate.' },
              prompt_eval_count: 50,
              eval_count: 15,
              model: 'qwen2.5:7b',
            }) + '\n'
          )
        );
        streamEmitter.emit('end');
      });

      const result = await streamPromise;
      expect(result.content).toBe('Click Through Rate.');
      expect(receivedTokens).toEqual(['Click ', 'Through ', 'Rate.']);
      expect(result.tokensUsed).toBe(65);
    });
  });
});
