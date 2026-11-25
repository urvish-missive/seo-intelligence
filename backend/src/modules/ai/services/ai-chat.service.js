// backend/src/modules/ai/services/ai-chat.service.js
// Orchestrates multi-turn conversation lifecycle, grounding context assembly,
// Ollama LLM execution, SSE streaming, and persistent audit logging.

import prisma from '../../../config/database.js';
import { ollamaService } from './ollama.service.js';
import { aiContextService } from './ai-context.service.js';
import { aiGuardrailService } from './ai-guardrail.service.js';
import { buildSystemPrompt } from '../prompts/system.prompt.js';
import { buildIntentUserPrompt } from '../prompts/intent-prompts.js';
import { OLLAMA_DEFAULTS } from '../config/ollama.config.js';
import { NotFoundError, BadRequestError } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';

const DEFAULT_TITLE = 'New SEO Consultation';
const HISTORY_MESSAGES = 4;
const HISTORY_CHARS_PER_MESSAGE = 1200;
const HEARTBEAT_MS = 15000;

function makeTitle(text) {
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

/** Earlier turns, oldest first, trimmed so the prompt stays within the context window. */
function buildHistory(messagesNewestFirst = []) {
  return [...messagesNewestFirst]
    .reverse()
    .filter((m) => m.content && ['USER', 'ASSISTANT'].includes(m.role))
    .map((m) => ({
      role: m.role.toLowerCase(),
      content:
        m.content.length > HISTORY_CHARS_PER_MESSAGE
          ? `${m.content.slice(0, HISTORY_CHARS_PER_MESSAGE)} …`
          : m.content,
    }));
}

export class AIChatService {
  /**
   * Model settings for a workspace: request overrides > saved AI settings > env defaults.
   */
  async resolveModelOptions(workspaceId, options = {}) {
    const config = await prisma.aIModelConfiguration
      .findUnique({ where: { workspaceId } })
      .catch(() => null);

    return {
      baseUrl: config?.ollamaUrl || OLLAMA_DEFAULTS.BASE_URL,
      model: options.model || config?.modelName || OLLAMA_DEFAULTS.MODEL,
      temperature:
        options.temperature !== undefined && options.temperature !== null
          ? Number(options.temperature)
          : config?.temperature ?? OLLAMA_DEFAULTS.TEMPERATURE,
    };
  }

  /**
   * Shared prompt assembly for chat and streaming.
   */
  async preparePrompt(workspaceId, conversation, sanitizedText, websiteId) {
    const { intent, contextString, evidenceMeta } = await aiContextService.buildContext(
      workspaceId,
      websiteId,
      sanitizedText
    );

    const messages = [
      { role: 'system', content: buildSystemPrompt({ domain: evidenceMeta.domain, clientName: evidenceMeta.client }) },
      ...buildHistory(conversation.messages),
      { role: 'user', content: buildIntentUserPrompt(intent, sanitizedText, contextString) },
    ];

    return { messages, evidenceMeta };
  }

  async touchConversation(conversation, sanitizedText) {
    const data = { updatedAt: new Date() };
    if (!conversation.title || conversation.title === DEFAULT_TITLE) {
      data.title = makeTitle(sanitizedText);
    }
    await prisma.aIConversation.update({ where: { id: conversation.id }, data }).catch(() => {});
  }

  /**
   * Create a new AI Conversation within a workspace.
   */
  async createConversation(workspaceId, userId, { websiteId = null, title = null } = {}) {
    if (websiteId) {
      const website = await prisma.website.findFirst({
        where: { id: websiteId, workspaceId },
      });
      if (!website) {
        throw new NotFoundError(`Website ${websiteId} not found in this workspace.`);
      }
    }

    return prisma.aIConversation.create({
      data: {
        workspaceId,
        userId,
        websiteId,
        title: title || DEFAULT_TITLE,
      },
      include: {
        website: {
          select: {
            id: true,
            domain: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  /**
   * List conversations in a workspace for a user or website.
   */
  async listConversations(workspaceId, userId, { websiteId = null, limit = 20, offset = 0 } = {}) {
    const where = {
      workspaceId,
      ...(websiteId ? { websiteId } : {}),
    };

    const [conversations, total] = await Promise.all([
      prisma.aIConversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
        include: {
          website: {
            select: {
              id: true,
              domain: true,
              client: { select: { id: true, name: true } },
            },
          },
          _count: {
            select: { messages: true },
          },
        },
      }),
      prisma.aIConversation.count({ where }),
    ]);

    return {
      conversations,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
      },
    };
  }

  /**
   * Retrieve a conversation with its full message history.
   */
  async getConversationById(workspaceId, conversationId) {
    const conversation = await prisma.aIConversation.findFirst({
      where: { id: conversationId, workspaceId },
      include: {
        website: {
          select: {
            id: true,
            domain: true,
            client: { select: { id: true, name: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundError(`Conversation ${conversationId} not found.`);
    }

    return conversation;
  }

  /**
   * Delete an entire conversation and its messages.
   */
  async deleteConversation(workspaceId, conversationId) {
    const conversation = await prisma.aIConversation.findFirst({
      where: { id: conversationId, workspaceId },
    });

    if (!conversation) {
      throw new NotFoundError(`Conversation ${conversationId} not found.`);
    }

    await prisma.aIConversation.delete({
      where: { id: conversationId },
    });

    return { success: true, message: 'Conversation deleted successfully' };
  }

  /**
   * Send a message and await the full JSON response.
   */
  async sendMessage(workspaceId, userId, conversationId, userText, options = {}) {
    const validation = aiGuardrailService.validateInput(userText);
    if (!validation.isValid) {
      throw new BadRequestError(validation.flag || 'Invalid message content');
    }
    const sanitizedText = validation.sanitized;

    const conversation = await prisma.aIConversation.findFirst({
      where: { id: conversationId, workspaceId },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: HISTORY_MESSAGES },
      },
    });

    if (!conversation) {
      throw new NotFoundError(`Conversation ${conversationId} not found.`);
    }

    const targetWebsiteId = options.websiteId || conversation.websiteId;
    const [{ messages, evidenceMeta }, modelOptions] = await Promise.all([
      this.preparePrompt(workspaceId, conversation, sanitizedText, targetWebsiteId),
      this.resolveModelOptions(workspaceId, options),
    ]);

    const userMessage = await prisma.aIMessage.create({
      data: { conversationId, role: 'USER', content: sanitizedText },
    });

    let ollamaResponse;
    try {
      ollamaResponse = await ollamaService.chat(messages, modelOptions);
      if (!ollamaResponse.content?.trim()) {
        throw new Error('The model returned an empty answer. Try rephrasing the question or using a larger model.');
      }
    } catch (err) {
      // Don't leave an unanswered question in the thread (it would be replayed as history)
      await prisma.aIMessage.delete({ where: { id: userMessage.id } }).catch(() => {});
      throw err;
    }

    const assistantMessage = await prisma.aIMessage.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        content: ollamaResponse.content,
        toolsUsed: { ...evidenceMeta, model: ollamaResponse.model },
        tokensUsed: ollamaResponse.tokensUsed,
        durationMs: ollamaResponse.durationMs,
      },
    });

    await this.touchConversation(conversation, sanitizedText);

    return { userMessage, assistantMessage, evidenceMeta };
  }

  /**
   * Stream a chat reply via Server-Sent Events (SSE).
   */
  async streamMessage(workspaceId, userId, conversationId, userText, res, options = {}) {
    const send = (event, data) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const validation = aiGuardrailService.validateInput(userText);
    if (!validation.isValid) {
      send('error', { error: validation.flag || 'Invalid message content' });
      return res.end();
    }
    const sanitizedText = validation.sanitized;

    const conversation = await prisma.aIConversation.findFirst({
      where: { id: conversationId, workspaceId },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: HISTORY_MESSAGES },
      },
    });

    if (!conversation) {
      send('error', { error: 'Conversation not found' });
      return res.end();
    }

    // Stop generating if the browser goes away (local CPU inference is expensive)
    const abort = new AbortController();
    let clientGone = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientGone = true;
        abort.abort();
      }
    });

    // Keep proxies from closing the connection while the model reads the prompt
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': keep-alive\n\n');
    }, HEARTBEAT_MS);

    let userMessage = null;
    try {
      const targetWebsiteId = options.websiteId || conversation.websiteId;
      const [{ messages, evidenceMeta }, modelOptions] = await Promise.all([
        this.preparePrompt(workspaceId, conversation, sanitizedText, targetWebsiteId),
        this.resolveModelOptions(workspaceId, options),
      ]);

      userMessage = await prisma.aIMessage.create({
        data: { conversationId, role: 'USER', content: sanitizedText },
      });

      send('start', { userMessageId: userMessage.id, evidenceMeta, model: modelOptions.model });

      const result = await ollamaService.streamChat(
        messages,
        { ...modelOptions, signal: abort.signal },
        (token) => send('token', { token })
      );

      const assistantMessage = await prisma.aIMessage.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: result.content,
          toolsUsed: { ...evidenceMeta, model: result.model },
          tokensUsed: result.tokensUsed,
          durationMs: result.durationMs,
        },
      });

      await this.touchConversation(conversation, sanitizedText);

      send('done', { assistantMessageId: assistantMessage.id, durationMs: result.durationMs, model: result.model });
    } catch (err) {
      if (userMessage) {
        await prisma.aIMessage.delete({ where: { id: userMessage.id } }).catch(() => {});
      }
      if (!clientGone) {
        logger.error('Streaming chat failed:', { error: err.message, code: err.code });
        send('error', { error: err.message, code: err.code || null });
      }
    } finally {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    }
  }

  /**
   * Generate an automated one-click executive analysis and save to AIAnalysis.
   */
  async generateWebsiteAnalysis(workspaceId, userId, websiteId, analysisType = 'EXECUTIVE_SUMMARY') {
    const website = await prisma.website.findFirst({
      where: { id: websiteId, workspaceId },
      include: { client: true },
    });

    if (!website) {
      throw new NotFoundError(`Website ${websiteId} not found.`);
    }

    const [{ contextString, evidenceMeta }, modelOptions] = await Promise.all([
      aiContextService.buildContext(workspaceId, websiteId, 'Overall SEO performance, opportunities and findings'),
      this.resolveModelOptions(workspaceId),
    ]);

    const userPrompt = `DATA (synced from this agency's GA4, Google Search Console and Microsoft Clarity):
"""
${contextString}
"""

Write an executive SEO performance report for ${website.domain} using only the DATA above, with these sections:
1. Executive summary
2. Traffic and engagement (GA4)
3. Search visibility and keyword opportunities (Search Console)
4. UX friction (Clarity)
5. Open SEO findings and risks
6. Prioritised 30-60-90 day action plan
If a section has no data, say which integration is missing instead of guessing.`;

    const response = await ollamaService.chat(
      [
        { role: 'system', content: buildSystemPrompt({ domain: website.domain, clientName: website.client?.name }) },
        { role: 'user', content: userPrompt },
      ],
      modelOptions
    );

    return prisma.aIAnalysis.create({
      data: {
        websiteId,
        analysisType,
        inputContext: evidenceMeta,
        outputSummary: response.content,
        recommendations: evidenceMeta,
        model: response.model || modelOptions.model,
        tokensUsed: response.tokensUsed,
        durationMs: response.durationMs,
      },
    });
  }
}

export const aiChatService = new AIChatService();
