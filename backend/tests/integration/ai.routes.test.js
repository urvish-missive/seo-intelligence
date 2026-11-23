// backend/tests/integration/ai.routes.test.js
// Integration and controller tests for AI Assistant endpoints: health, models, config, conversation CRUD, messaging, and RBAC.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { aiChatController } from '../../src/modules/ai/controllers/ai-chat.controller.js';
import { aiChatService } from '../../src/modules/ai/services/ai-chat.service.js';
import { ollamaService } from '../../src/modules/ai/services/ollama.service.js';
import { aiContextService } from '../../src/modules/ai/services/ai-context.service.js';
import prisma from '../../src/config/database.js';

function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    setHeader(key, val) {
      this.headers[key] = val;
      return this;
    },
    write: jest.fn(),
    end: jest.fn(),
  };
  return res;
}

describe('AI Assistant Controller & Service Integration Tests', () => {
  const mockUser = {
    id: 'user-seo-1',
    email: 'seo@missive.test',
    role: 'seo_manager',
    workspaceId: 'ws-test-ai',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Health and Models', () => {
    it('should return Ollama health with supported catalog', async () => {
      jest.spyOn(prisma.aIModelConfiguration, 'findUnique').mockResolvedValue(null);
      jest.spyOn(ollamaService, 'checkHealth').mockResolvedValue({
        available: true,
        modelPresent: true,
        models: ['qwen2.5:7b'],
        activeModel: 'qwen2.5:7b',
        message: 'Ollama is active',
      });

      const req = {
        params: { workspaceId: 'ws-test-ai' },
        user: mockUser,
      };
      const res = createMockResponse();
      let nextError = null;

      await aiChatController.getHealth(req, res, (err) => { nextError = err; });

      expect(nextError).toBeNull();
      expect(res.data.success).toBe(true);
      expect(res.data.data.available).toBe(true);
      expect(res.data.data.modelPresent).toBe(true);
      expect(res.data.data.supportedModels).toBeDefined();
    });

    it('should list local models', async () => {
      jest.spyOn(prisma.aIModelConfiguration, 'findUnique').mockResolvedValue(null);
      jest.spyOn(ollamaService, 'listModels').mockResolvedValue([
        { name: 'qwen2.5:7b' },
        { name: 'llama3:8b' },
      ]);

      const req = {
        params: { workspaceId: 'ws-test-ai' },
        user: mockUser,
      };
      const res = createMockResponse();

      await aiChatController.getModels(req, res, () => {});

      expect(res.data.success).toBe(true);
      expect(res.data.data.models).toHaveLength(2);
    });
  });

  describe('Workspace AI Configuration', () => {
    it('should return existing workspace configuration', async () => {
      jest.spyOn(prisma.aIModelConfiguration, 'findUnique').mockResolvedValue({
        id: 'cfg-1',
        workspaceId: 'ws-test-ai',
        ollamaUrl: 'http://127.0.0.1:11434',
        modelName: 'qwen2.5:7b',
        temperature: 0.3,
        maxTokens: 8000,
        isHealthy: true,
      });

      const req = {
        params: { workspaceId: 'ws-test-ai' },
        user: mockUser,
      };
      const res = createMockResponse();

      await aiChatController.getConfig(req, res, () => {});

      expect(res.data.success).toBe(true);
      expect(res.data.data.modelName).toBe('qwen2.5:7b');
    });

    it('should upsert workspace model configuration', async () => {
      jest.spyOn(prisma.aIModelConfiguration, 'upsert').mockResolvedValue({
        id: 'cfg-1',
        workspaceId: 'ws-test-ai',
        ollamaUrl: 'http://127.0.0.1:11434',
        modelName: 'qwen2.5:14b',
        temperature: 0.2,
        maxTokens: 12000,
      });

      const req = {
        params: { workspaceId: 'ws-test-ai' },
        user: mockUser,
        body: {
          modelName: 'qwen2.5:14b',
          temperature: 0.2,
          maxTokens: 12000,
        },
      };
      const res = createMockResponse();

      await aiChatController.updateConfig(req, res, () => {});

      expect(res.data.success).toBe(true);
      expect(res.data.data.modelName).toBe('qwen2.5:14b');
    });
  });

  describe('Conversation Thread Management', () => {
    it('should create a new conversation thread', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue({ id: 'web-1', workspaceId: 'ws-test-ai' });
      jest.spyOn(prisma.aIConversation, 'create').mockResolvedValue({
        id: 'conv-101',
        workspaceId: 'ws-test-ai',
        userId: 'user-seo-1',
        websiteId: 'web-1',
        title: 'Organic Traffic Diagnosis',
        website: { id: 'web-1', domain: 'example.com', client: { id: 'c-1', name: 'Acme' } },
      });

      const req = {
        params: { workspaceId: 'ws-test-ai' },
        user: mockUser,
        body: {
          websiteId: 'web-1',
          title: 'Organic Traffic Diagnosis',
        },
      };
      const res = createMockResponse();

      await aiChatController.createConversation(req, res, () => {});

      expect(res.statusCode).toBe(201);
      expect(res.data.success).toBe(true);
      expect(res.data.data.id).toBe('conv-101');
    });

    it('should list conversations with message counts', async () => {
      jest.spyOn(prisma.aIConversation, 'findMany').mockResolvedValue([
        {
          id: 'conv-101',
          title: 'Organic Traffic Diagnosis',
          updatedAt: new Date(),
          website: { id: 'web-1', domain: 'example.com' },
          _count: { messages: 4 },
        },
      ]);
      jest.spyOn(prisma.aIConversation, 'count').mockResolvedValue(1);

      const req = {
        params: { workspaceId: 'ws-test-ai' },
        user: mockUser,
        query: { limit: 10, offset: 0 },
      };
      const res = createMockResponse();

      await aiChatController.listConversations(req, res, () => {});

      expect(res.data.success).toBe(true);
      expect(res.data.data.conversations).toHaveLength(1);
      expect(res.data.data.pagination.total).toBe(1);
    });

    it('should retrieve single conversation with message history', async () => {
      jest.spyOn(prisma.aIConversation, 'findFirst').mockResolvedValue({
        id: 'conv-101',
        workspaceId: 'ws-test-ai',
        title: 'Organic Traffic Diagnosis',
        website: { id: 'web-1', domain: 'example.com' },
        messages: [
          { id: 'm-1', role: 'USER', content: 'Why did traffic drop?' },
          { id: 'm-2', role: 'ASSISTANT', content: 'The decline was driven by...' },
        ],
      });

      const req = {
        params: { workspaceId: 'ws-test-ai', conversationId: 'conv-101' },
        user: mockUser,
      };
      const res = createMockResponse();

      await aiChatController.getConversation(req, res, () => {});

      expect(res.data.success).toBe(true);
      expect(res.data.data.messages).toHaveLength(2);
    });

    it('should delete conversation thread', async () => {
      jest.spyOn(prisma.aIConversation, 'findFirst').mockResolvedValue({
        id: 'conv-101',
        workspaceId: 'ws-test-ai',
      });
      jest.spyOn(prisma.aIConversation, 'delete').mockResolvedValue({ id: 'conv-101' });

      const req = {
        params: { workspaceId: 'ws-test-ai', conversationId: 'conv-101' },
        user: mockUser,
      };
      const res = createMockResponse();

      await aiChatController.deleteConversation(req, res, () => {});

      expect(res.data.success).toBe(true);
    });
  });

  describe('Chat Messaging Interaction', () => {
    it('should process user message, assemble evidence, query Ollama, and save assistant reply', async () => {
      jest.spyOn(prisma.aIConversation, 'findFirst').mockResolvedValue({
        id: 'conv-101',
        workspaceId: 'ws-test-ai',
        websiteId: 'web-1',
        title: 'New SEO Consultation',
        messages: [],
      });

      jest.spyOn(prisma.aIMessage, 'create')
        .mockResolvedValueOnce({
          id: 'msg-user-1',
          role: 'USER',
          content: 'Why did organic traffic drop?',
        })
        .mockResolvedValueOnce({
          id: 'msg-asst-1',
          role: 'ASSISTANT',
          content: 'GA4 reports a 14.2% drop in organic sessions.',
          tokensUsed: 120,
          durationMs: 450,
        });

      jest.spyOn(aiContextService, 'buildContext').mockResolvedValue({
        intent: 'TRAFFIC_ANALYSIS',
        contextString: '{"domain":"example.com","ga4":{"sessions":1200}}',
        evidenceMeta: { domain: 'example.com', client: 'Acme', intent: 'TRAFFIC_ANALYSIS' },
      });

      jest.spyOn(ollamaService, 'chat').mockResolvedValue({
        content: 'GA4 reports a 14.2% drop in organic sessions.',
        tokensUsed: 120,
        durationMs: 450,
        model: 'qwen2.5:7b',
      });

      jest.spyOn(prisma.aIConversation, 'update').mockResolvedValue({ id: 'conv-101' });

      const req = {
        params: { workspaceId: 'ws-test-ai', conversationId: 'conv-101' },
        user: mockUser,
        body: {
          message: 'Why did organic traffic drop?',
        },
      };
      const res = createMockResponse();

      await aiChatController.sendMessage(req, res, () => {});

      expect(res.data.success).toBe(true);
      expect(res.data.data.assistantMessage.content).toBe('GA4 reports a 14.2% drop in organic sessions.');
      expect(res.data.data.evidenceMeta.intent).toBe('TRAFFIC_ANALYSIS');
    });

    it('should generate one-click executive analysis and save to AIAnalysis', async () => {
      jest.spyOn(prisma.website, 'findFirst').mockResolvedValue({
        id: 'web-1',
        domain: 'example.com',
        workspaceId: 'ws-test-ai',
        client: { name: 'Acme' },
      });

      jest.spyOn(aiContextService, 'buildContext').mockResolvedValue({
        intent: 'SEO_FINDINGS',
        contextString: '{"findings":[]}',
        evidenceMeta: { domain: 'example.com' },
      });

      jest.spyOn(ollamaService, 'chat').mockResolvedValue({
        content: 'Executive Report: 1. Organic Growth...',
        tokensUsed: 350,
        durationMs: 1200,
        model: 'qwen2.5:7b',
      });

      jest.spyOn(prisma.aIAnalysis, 'create').mockResolvedValue({
        id: 'analysis-1',
        websiteId: 'web-1',
        analysisType: 'EXECUTIVE_SUMMARY',
        outputSummary: 'Executive Report: 1. Organic Growth...',
      });

      const req = {
        params: { workspaceId: 'ws-test-ai', websiteId: 'web-1' },
        user: mockUser,
        body: { analysisType: 'EXECUTIVE_SUMMARY' },
      };
      const res = createMockResponse();

      await aiChatController.generateAnalysis(req, res, () => {});

      expect(res.statusCode).toBe(201);
      expect(res.data.success).toBe(true);
      expect(res.data.data.id).toBe('analysis-1');
    });
  });
});
