// backend/src/modules/ai/routes/ai.routes.js
// Express Router for Local AI Assistant, Conversations, Health, and Configuration.

import { Router } from 'express';
import { aiChatController } from '../controllers/ai-chat.controller.js';
import { requireAuth } from '../../../middleware/auth.js';
import { requireWorkspace } from '../../../middleware/tenantContext.js';
import { requirePermission } from '../../../middleware/requirePermission.js';

const router = Router();

// Protect all routes with authentication and workspace tenancy
router.use('/workspaces/:workspaceId', requireAuth, requireWorkspace);

// 1. Health and Model Catalog
router.get(
  '/workspaces/:workspaceId/ai/health',
  requirePermission('ai.chat'),
  (req, res, next) => aiChatController.getHealth(req, res, next)
);

router.get(
  '/workspaces/:workspaceId/ai/models',
  requirePermission('ai.chat'),
  (req, res, next) => aiChatController.getModels(req, res, next)
);

// 2. Workspace Configuration
router.get(
  '/workspaces/:workspaceId/ai/config',
  requirePermission('ai.chat'),
  (req, res, next) => aiChatController.getConfig(req, res, next)
);

router.put(
  '/workspaces/:workspaceId/ai/config',
  requirePermission('workspace.manage'),
  (req, res, next) => aiChatController.updateConfig(req, res, next)
);

// 3. Conversation Management
router.get(
  '/workspaces/:workspaceId/ai/conversations',
  requirePermission('ai.chat'),
  (req, res, next) => aiChatController.listConversations(req, res, next)
);

router.post(
  '/workspaces/:workspaceId/ai/conversations',
  requirePermission('ai.chat'),
  (req, res, next) => aiChatController.createConversation(req, res, next)
);

router.get(
  '/workspaces/:workspaceId/ai/conversations/:conversationId',
  requirePermission('ai.chat'),
  (req, res, next) => aiChatController.getConversation(req, res, next)
);

router.delete(
  '/workspaces/:workspaceId/ai/conversations/:conversationId',
  requirePermission('ai.chat'),
  (req, res, next) => aiChatController.deleteConversation(req, res, next)
);

// 4. Message Interaction (Standard JSON & SSE Streaming)
router.post(
  '/workspaces/:workspaceId/ai/conversations/:conversationId/messages',
  requirePermission('ai.chat'),
  (req, res, next) => aiChatController.sendMessage(req, res, next)
);

router.post(
  '/workspaces/:workspaceId/ai/conversations/:conversationId/stream',
  requirePermission('ai.chat'),
  (req, res, next) => aiChatController.streamMessage(req, res, next)
);

// 5. Automated Deep Analysis
router.post(
  '/workspaces/:workspaceId/ai/websites/:websiteId/analyse',
  requirePermission('ai.analyse'),
  (req, res, next) => aiChatController.generateAnalysis(req, res, next)
);

export default router;
