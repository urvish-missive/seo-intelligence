// backend/src/modules/workspaces/workspace.validation.js
import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Workspace name must be at least 2 characters').max(100),
  description: z.string().trim().max(500).optional(),
  timezone: z.string().max(50).default('UTC'),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  timezone: z.string().max(50).optional(),
  logo: z.string().url().max(500).optional().nullable(),
});
