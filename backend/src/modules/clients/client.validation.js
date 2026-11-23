// backend/src/modules/clients/client.validation.js
import { z } from 'zod';

export const createClientSchema = z.object({
  name: z.string().trim().min(2, 'Client name must be at least 2 characters').max(100),
  companyName: z.string().trim().max(150).optional(),
  contactName: z.string().trim().max(100).optional(),
  contactEmail: z.string().trim().email('Invalid contact email').toLowerCase().optional().or(z.literal('')),
  contactPhone: z.string().trim().max(50).optional(),
  website: z.string().trim().url('Must be a valid URL').max(500).optional().or(z.literal('')),
  industry: z.string().trim().max(100).optional(),
  timezone: z.string().max(50).default('UTC'),
  notes: z.string().max(2000).optional(),
});

export const updateClientSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  companyName: z.string().trim().max(150).optional().nullable(),
  contactName: z.string().trim().max(100).optional().nullable(),
  contactEmail: z.string().trim().email('Invalid contact email').toLowerCase().optional().or(z.literal('')).nullable(),
  contactPhone: z.string().trim().max(50).optional().nullable(),
  website: z.string().trim().url('Must be a valid URL').max(500).optional().or(z.literal('')).nullable(),
  industry: z.string().trim().max(100).optional().nullable(),
  timezone: z.string().max(50).optional(),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
});

export const assignClientMemberSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
});
