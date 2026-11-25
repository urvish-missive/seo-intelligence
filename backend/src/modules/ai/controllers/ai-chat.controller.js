// backend/src/modules/ai/controllers/ai-chat.controller.js
// REST & SSE Controller for AI Assistant interactions, conversation history, and health.

import { aiChatService } from '../services/ai-chat.service.js';
import { ollamaService } from '../services/ollama.service.js';
import prisma from '../../../config/database.js';
import { OLLAMA_DEFAULTS, SUPPORTED_MODELS } from '../config/ollama.config.js';

export class AIChatController {
  /**
   * Health and connectivity check for local Ollama instance.
   */
  async getHealth(req, res, next) {
    try {
      const { workspaceId } = req.params;

      // Check if workspace has custom model config
      const config = await prisma.aIModelConfiguration.findUnique({
        where: { workspaceId },
      }).catch(() => null);

      const url = config?.ollamaUrl || OLLAMA_DEFAULTS.BASE_URL;
      const model = config?.modelName || OLLAMA_DEFAULTS.MODEL;

      const health = await ollamaService.checkHealth(url, model);

      // Persist health state back to config if exists
      if (config) {
        await prisma.aIModelConfiguration.update({
          where: { workspaceId },
          data: {
            isHealthy: health.available && health.modelPresent,
            lastCheckedAt: new Date(),
          },
        }).catch(() => {});
      }

      res.json({
        success: true,
        data: {
          ...health,
          supportedModels: SUPPORTED_MODELS,
          config: {
            ollamaUrl: url,
            modelName: model,
            temperature: config?.temperature ?? OLLAMA_DEFAULTS.TEMPERATURE,
            maxTokens: config?.maxTokens ?? OLLAMA_DEFAULTS.MAX_CONTEXT_TOKENS,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * List installed models in local Ollama instance.
   */
  async getModels(req, res, next) {
    try {
      const { workspaceId } = req.params;
      const config = await prisma.aIModelConfiguration.findUnique({
        where: { workspaceId },
      }).catch(() => null);

      const url = config?.ollamaUrl || OLLAMA_DEFAULTS.BASE_URL;
      const models = await ollamaService.listModels(url);

      res.json({
        success: true,
        data: {
          models,
          supportedCatalog: SUPPORTED_MODELS,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Retrieve workspace AI model configuration.
   */
  async getConfig(req, res, next) {
    try {
      const { workspaceId } = req.params;
      let config = await prisma.aIModelConfiguration.findUnique({
        where: { workspaceId },
      });

      if (!config) {
        // Return default configuration
        config = {
          workspaceId,
          ollamaUrl: OLLAMA_DEFAULTS.BASE_URL,
          modelName: OLLAMA_DEFAULTS.MODEL,
          temperature: OLLAMA_DEFAULTS.TEMPERATURE,
          maxTokens: OLLAMA_DEFAULTS.MAX_CONTEXT_TOKENS,
          isHealthy: false,
          lastCheckedAt: null,
        };
      }

      res.json({ success: true, data: config });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update or upsert workspace AI model configuration.
   */
  async updateConfig(req, res, next) {
    try {
      const { workspaceId } = req.params;
      const { ollamaUrl, modelName, temperature, maxTokens } = req.body;

      // Only allow models that are actually installed, or chat would fail later
      if (modelName) {
        const existing = await prisma.aIModelConfiguration.findUnique({ where: { workspaceId } }).catch(() => null);
        const url = ollamaUrl || existing?.ollamaUrl || OLLAMA_DEFAULTS.BASE_URL;
        const installed = (await ollamaService.listModels(url)).map((m) => m.name);
        if (installed.length > 0 && !installed.includes(modelName)) {
          return res.status(400).json({
            success: false,
            message: `Model "${modelName}" is not installed in Ollama. Installed: ${installed.join(', ')}.`,
          });
        }
      }
      if (temperature !== undefined && (Number.isNaN(Number(temperature)) || Number(temperature) < 0 || Number(temperature) > 2)) {
        return res.status(400).json({ success: false, message: 'Temperature must be between 0 and 2.' });
      }

      const updated = await prisma.aIModelConfiguration.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          ollamaUrl: ollamaUrl || OLLAMA_DEFAULTS.BASE_URL,
          modelName: modelName || OLLAMA_DEFAULTS.MODEL,
          temperature: temperature !== undefined ? Number(temperature) : OLLAMA_DEFAULTS.TEMPERATURE,
          maxTokens: maxTokens !== undefined ? Number(maxTokens) : OLLAMA_DEFAULTS.MAX_CONTEXT_TOKENS,
        },
        update: {
          ...(ollamaUrl ? { ollamaUrl } : {}),
          ...(modelName ? { modelName } : {}),
          ...(temperature !== undefined ? { temperature: Number(temperature) } : {}),
          ...(maxTokens !== undefined ? { maxTokens: Number(maxTokens) } : {}),
        },
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  /**
   * List conversations for the current workspace.
   */
  async listConversations(req, res, next) {
    try {
      const { workspaceId } = req.params;
      const userId = req.user.id;
      const { websiteId, limit, offset } = req.query;

      const result = await aiChatService.listConversations(workspaceId, userId, {
        websiteId,
        limit,
        offset,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create a new conversation thread.
   */
  async createConversation(req, res, next) {
    try {
      const { workspaceId } = req.params;
      const userId = req.user.id;
      const { websiteId, title } = req.body;

      const conversation = await aiChatService.createConversation(workspaceId, userId, {
        websiteId,
        title,
      });

      res.status(201).json({ success: true, data: conversation });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get a conversation and its messages.
   */
  async getConversation(req, res, next) {
    try {
      const { workspaceId, conversationId } = req.params;
      const conversation = await aiChatService.getConversationById(workspaceId, conversationId);

      res.json({ success: true, data: conversation });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete a conversation.
   */
  async deleteConversation(req, res, next) {
    try {
      const { workspaceId, conversationId } = req.params;
      const result = await aiChatService.deleteConversation(workspaceId, conversationId);

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Send a message (Standard JSON response).
   */
  async sendMessage(req, res, next) {
    try {
      const { workspaceId, conversationId } = req.params;
      const userId = req.user.id;
      const { message, websiteId, model, temperature } = req.body;

      const result = await aiChatService.sendMessage(
        workspaceId,
        userId,
        conversationId,
        message,
        { websiteId, model, temperature }
      );

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Stream a chat reply via Server-Sent Events (SSE).
   */
  async streamMessage(req, res, next) {
    try {
      const { workspaceId, conversationId } = req.params;
      const userId = req.user.id;
      const { message, websiteId, model, temperature } = req.body;

      // Set standard SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      await aiChatService.streamMessage(
        workspaceId,
        userId,
        conversationId,
        message,
        res,
        { websiteId, model, temperature }
      );
    } catch (err) {
      if (!res.headersSent) {
        next(err);
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    }
  }

  /**
   * One-click executive analysis on a website.
   */
  async generateAnalysis(req, res, next) {
    try {
      const { workspaceId, websiteId } = req.params;
      const userId = req.user.id;
      const { analysisType } = req.body;

      const analysis = await aiChatService.generateWebsiteAnalysis(
        workspaceId,
        userId,
        websiteId,
        analysisType
      );

      res.status(201).json({ success: true, data: analysis });
    } catch (err) {
      next(err);
    }
  }
}

export const aiChatController = new AIChatController();
