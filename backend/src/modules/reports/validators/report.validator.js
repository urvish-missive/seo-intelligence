// backend/src/modules/reports/validators/report.validator.js
// Zod request validators for report generation, scheduling, and branding configurations.

import { z } from 'zod';

export const reportTypeEnum = z.enum([
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'CUSTOM',
  'MONTHLY_SEO',
  'WEBSITE_PERFORMANCE',
  'KEYWORD_OPPORTUNITY',
  'TRAFFIC_DROP',
  'CLARITY_BEHAVIOUR',
]);

export const reportFormatEnum = z.enum(['PDF', 'EXCEL', 'BOTH']);

export const createReportSchema = z.object({
  websiteId: z.string().uuid('Invalid website ID'),
  reportType: reportTypeEnum,
  format: reportFormatEnum.default('PDF'),
  title: z.string().min(2).max(255).optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'periodStart must be YYYY-MM-DD'),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'periodEnd must be YYYY-MM-DD'),
  comparisonStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'comparisonStart must be YYYY-MM-DD').optional(),
  comparisonEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'comparisonEnd must be YYYY-MM-DD').optional(),
  timezone: z.string().default('UTC'),
  includeAiSummary: z.boolean().default(false),
  configuration: z.object({
    sections: z.array(z.string()).optional(),
    metrics: z.array(z.string()).optional(),
    maxKeywords: z.number().int().min(5).max(100).default(25),
    maxLandingPages: z.number().int().min(5).max(100).default(25),
  }).optional(),
});

export const previewReportSchema = z.object({
  websiteId: z.string().uuid(),
  reportType: reportTypeEnum,
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comparisonStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  comparisonEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const createScheduleSchema = z.object({
  websiteId: z.string().uuid('Invalid website ID'),
  reportName: z.string().min(2).max(255),
  reportType: reportTypeEnum,
  format: reportFormatEnum.default('PDF'),
  frequency: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY']),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(), // 0 = Sunday, 1 = Monday
  scheduledTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'scheduledTime must be HH:mm').default('09:00'),
  timezone: z.string().default('UTC'),
  recipients: z.array(z.string().email('Invalid recipient email address')).optional(),
  isActive: z.boolean().default(true),
  configuration: z.object({
    includeAiSummary: z.boolean().default(false),
    maxKeywords: z.number().int().min(5).max(100).default(25),
    sections: z.array(z.string()).optional(),
  }).optional(),
});

export const updateScheduleSchema = createScheduleSchema.partial().omit({ websiteId: true });

export const brandingSchema = z.object({
  agencyName: z.string().min(2).max(255),
  logoStorageKey: z.string().max(500).nullable().optional(),
  brandPrimaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Must be a valid hex color').default('#4f46e5'),
  brandSecondaryColor: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Must be a valid hex color').default('#0f172a'),
  website: z.string().url('Invalid website URL').nullable().optional().or(z.literal('')),
  contactEmail: z.string().email('Invalid email address').nullable().optional().or(z.literal('')),
  footerText: z.string().max(500).nullable().optional(),
});
