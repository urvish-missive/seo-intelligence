// backend/src/modules/integrations/clarity/clarity.validation.js
// Zod validation schemas for Microsoft Clarity integration.

import { z } from 'zod';

export const createClarityConnectionSchema = z.object({
  projectId: z
    .string()
    .min(3, 'Clarity Project ID must be at least 3 characters')
    .max(100, 'Clarity Project ID must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Clarity Project ID may only contain letters, numbers, underscores, and dashes'),
  projectName: z
    .string()
    .max(255, 'Project display name must not exceed 255 characters')
    .optional()
    .nullable(),
  apiToken: z
    .string()
    .min(10, 'Microsoft Clarity API token must be at least 10 characters')
    .max(1000, 'API token is unexpectedly long'),
});

export const replaceClarityTokenSchema = z.object({
  apiToken: z
    .string()
    .min(10, 'Microsoft Clarity API token must be at least 10 characters')
    .max(1000, 'API token is unexpectedly long'),
  projectName: z
    .string()
    .max(255)
    .optional()
    .nullable(),
});

export const mapClarityWebsiteSchema = z.object({
  clarityConnectionId: z
    .string()
    .uuid('Valid Clarity connection ID is required'),
});

export const clarityImportSchema = z.object({
  numOfDays: z
    .union([z.literal(1), z.literal(2), z.literal(3)])
    .default(1),
  preset: z
    .enum(['OVERVIEW', 'DEVICE', 'BROWSER', 'COUNTRY', 'URL', 'ACQUISITION'])
    .default('OVERVIEW'),
});
