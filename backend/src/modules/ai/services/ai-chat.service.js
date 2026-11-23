// backend/src/modules/ai/services/ai-chat.service.js
// Orchestrates multi-turn conversation lifecycle, grounding context assembly,
// Ollama LLM execution, SSE streaming, and persistent audit logging.

import prisma from '../../../config/database.js';
import { ollamaService } from './ollama.service.js';
import { aiContextService } from './ai-context.service.js';
import { aiGuardrailService } from './ai-guardrail.service.js';
import { buildSystemPrompt } from '../prompts/system.prompt.js';
import { buildIntentUserPrompt } from '../prompts/intent-prompts.js';
import { NotFoundError, BadRequestError } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';

export class AIChatService {
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

    const conversation = await prisma.aIConversation.create({
      data: {
        workspaceId,
        userId,
        websiteId,
        title: title || 'New SEO Consultation',
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

    return conversation;
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
    // 1. Validate & sanitize input
    const validation = aiGuardrailService.validateInput(userText);
    if (!validation.isValid) {
      throw new BadRequestError(validation.flag || 'Invalid message content');
    }
    const sanitizedText = validation.sanitized;

    // 2. Fetch conversation
    const conversation = await prisma.aIConversation.findFirst({
      where: { id: conversationId, workspaceId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 6, // previous messages for context
        },
      },
    });

    if (!conversation) {
      throw new NotFoundError(`Conversation ${conversationId} not found.`);
    }

    const targetWebsiteId = options.websiteId || conversation.websiteId;

    // 3. Save User Message
    const userMessage = await prisma.aIMessage.create({
      data: {
        conversationId,
        role: 'USER',
        content: sanitizedText,
      },
    });

    // 4. Retrieve Grounded Context Data
    const { intent, contextString, evidenceMeta } = await aiContextService.buildContext(
      workspaceId,
      targetWebsiteId,
      sanitizedText
    );

    // 5. Build System Prompt & Messages History
    const systemPrompt = buildSystemPrompt({
      domain: evidenceMeta.domain,
      clientName: evidenceMeta.client,
    });

    const userPromptWithContext = buildIntentUserPrompt(intent, sanitizedText, contextString);

    // Assemble conversation history (oldest first)
    const historyMessages = (conversation.messages || [])
      .reverse()
      .map(m => ({
        role: m.role.toLowerCase(),
        content: m.content,
      }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: userPromptWithContext },
    ];

    // 6. Invoke Local Ollama Model
    const ollamaResponse = await ollamaService.chat(messages, {
      model: options.model,
      temperature: options.temperature,
    });

    // 7. Save Assistant Message
    const assistantMessage = await prisma.aIMessage.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        content: ollamaResponse.content,
        toolsUsed: evidenceMeta,
        tokensUsed: ollamaResponse.tokensUsed,
        durationMs: ollamaResponse.durationMs,
      },
    });

    // 8. Update conversation title if this is the first exchange
    if (conversation.title === 'New SEO Consultation' || !conversation.title) {
      const generatedTitle = sanitizedText.length > 40
        ? sanitizedText.slice(0, 37) + '...'
        : sanitizedText;
      await prisma.aIConversation.update({
        where: { id: conversationId },
        data: { title: generatedTitle, updatedAt: new Date() },
      }).catch(() => {});
    } else {
      await prisma.aIConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }).catch(() => {});
    }

    return {
      userMessage,
      assistantMessage,
      evidenceMeta,
    };
  }

  /**
   * Stream a chat reply via Server-Sent Events (SSE).
   */
  async streamMessage(workspaceId, userId, conversationId, userText, res, options = {}) {
    const validation = aiGuardrailService.validateInput(userText);
    if (!validation.isValid) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: validation.flag })}\n\n`);
      return res.end();
    }
    const sanitizedText = validation.sanitized;

    const conversation = await prisma.aIConversation.findFirst({
      where: { id: conversationId, workspaceId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 6,
        },
      },
    });

    if (!conversation) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Conversation not found' })}\n\n`);
      return res.end();
    }

    const targetWebsiteId = options.websiteId || conversation.websiteId;

    // 1. Save User Message
    const userMessage = await prisma.aIMessage.create({
      data: {
        conversationId,
        role: 'USER',
        content: sanitizedText,
      },
    });

    // 2. Build Grounded Context
    const { intent, contextString, evidenceMeta } = await aiContextService.buildContext(
      workspaceId,
      targetWebsiteId,
      sanitizedText
    );

    // Send start event to client with metadata
    res.write(`event: start\ndata: ${JSON.stringify({ userMessageId: userMessage.id, evidenceMeta })}\n\n`);

    const systemPrompt = buildSystemPrompt({
      domain: evidenceMeta.domain,
      clientName: evidenceMeta.client,
    });
    const userPromptWithContext = buildIntentUserPrompt(intent, sanitizedText, contextString);

    const historyMessages = (conversation.messages || [])
      .reverse()
      .map(m => ({
        role: m.role.toLowerCase(),
        content: m.content,
      }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: userPromptWithContext },
    ];

    try {
      const result = await ollamaService.streamChat(
        messages,
        {
          model: options.model,
          temperature: options.temperature,
        },
        (token) => {
          res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
        }
      );

      // Save assistant message to database
      const assistantMessage = await prisma.aIMessage.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: result.content,
          toolsUsed: evidenceMeta,
          tokensUsed: result.tokensUsed,
          durationMs: result.durationMs,
        },
      });

      // Update conversation title if needed
      if (conversation.title === 'New SEO Consultation' || !conversation.title) {
        const generatedTitle = sanitizedText.length > 40
          ? sanitizedText.slice(0, 37) + '...'
          : sanitizedText;
        await prisma.aIConversation.update({
          where: { id: conversationId },
          data: { title: generatedTitle, updatedAt: new Date() },
        }).catch(() => {});
      }

      res.write(`event: done\ndata: ${JSON.stringify({ assistantMessageId: assistantMessage.id, durationMs: result.durationMs })}\n\n`);
      res.end();
    } catch (err) {
      logger.error('Streaming chat failed:', { error: err.message });
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
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

    const { contextString, evidenceMeta } = await aiContextService.buildContext(
      workspaceId,
      websiteId,
      'Generate a comprehensive SEO performance and opportunity analysis.'
    );

    const systemPrompt = buildSystemPrompt({
      domain: website.domain,
      clientName: website.client?.name,
    });

    const userPrompt = `Generate a rigorous, executive-level SEO Performance & Opportunity Report for ${website.domain}.

DATA EVIDENCE:
${contextString}

Structure your report into:
1. Executive Summary & Growth Trajectory
2. Traffic & Engagement Shifts (GA4 Analysis)
3. Search Visibility & Keyword Opportunities (GSC Striking Distance)
4. UX Friction & Conversion Barriers (Clarity Heatmap Insights)
5. Critical Deterministic Findings & Decay Risks
6. Prioritised 30-60-90 Day SEO Action Plan`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await ollamaService.chat(messages);

    const analysis = await prisma.aIAnalysis.create({
      data: {
        websiteId,
        analysisType,
        inputContext: evidenceMeta,
        outputSummary: response.content,
        recommendations: evidenceMeta,
        model: response.model || 'qwen2.5:7b',
        tokensUsed: response.tokensUsed,
        durationMs: response.durationMs,
      },
    });

    return analysis;
  }
}

export const aiChatService = new AIChatService();
