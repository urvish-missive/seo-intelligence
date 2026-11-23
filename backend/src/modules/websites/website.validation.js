// backend/src/modules/websites/website.validation.js
import { z } from 'zod';

export const normalizeDomain = (input) => {
  if (!input) return '';
  let domain = input.trim().toLowerCase();
  // Strip protocol
  domain = domain.replace(/^https?:\/\//i, '');
  // Strip www. prefix
  domain = domain.replace(/^www\./i, '');
  // Strip paths, query strings, and trailing slashes
  domain = domain.split('/')[0].split('?')[0].split('#')[0];
  return domain;
};

export const createWebsiteSchema = z.object({
  name: z.string().trim().min(2, 'Website name must be at least 2 characters').max(100),
  domain: z
    .string()
    .trim()
    .min(3, 'Domain must be at least 3 characters')
    .transform(normalizeDomain)
    .refine((d) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(d), {
      message: 'Invalid domain format (e.g. example.com or app.example.com)',
    }),
  url: z.string().trim().url('Must be a valid URL (e.g. https://example.com)').optional().or(z.literal('')),
  description: z.string().max(1000).optional(),
  timezone: z.string().max(50).default('UTC'),
});

export const updateWebsiteSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  url: z.string().trim().url('Must be a valid URL').optional().or(z.literal('')).nullable(),
  description: z.string().max(1000).optional().nullable(),
  timezone: z.string().max(50).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
});
