// backend/src/mcp/prompts/seo-analyst.prompts.js
// Standardized reusable prompts for AI clients to conduct SEO investigations.

import { z } from 'zod';

export function registerAllPrompts(server) {
  // 1. seo_website_review
  server.prompt(
    'seo_website_review',
    'Execute a comprehensive SEO performance review using available GA4, GSC, and Clarity data.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Start date (YYYY-MM-DD)'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('End date (YYYY-MM-DD)'),
    },
    async (args) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please conduct a comprehensive SEO performance review for website ID "${args.websiteId}" for the period ${args.startDate} to ${args.endDate}.

Recommended procedure:
1. Call get_website_overview to inspect overall performance and sync freshness.
2. Call get_ga4_summary to examine organic sessions, engagement rates, and bounce rates.
3. Call get_gsc_summary and get_gsc_keyword_performance to evaluate impressions, clicks, and rankings.
4. Call get_clarity_summary to identify dead clicks, rage clicks, and UX friction.
5. Call get_seo_findings to identify unresolved issues.
6. Provide an executive summary with a prioritised, numbered action plan. Use British English.`,
            },
          },
        ],
      };
    }
  );

  // 2. investigate_organic_traffic_drop
  server.prompt(
    'investigate_organic_traffic_drop',
    'Investigate the root causes of an organic search traffic decline.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Current period start date'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Current period end date'),
    },
    async (args) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please investigate the organic traffic decline for website ID "${args.websiteId}" during ${args.startDate} to ${args.endDate}.

Recommended procedure:
1. Call get_traffic_drop_analysis to inspect period-over-period comparison.
2. Call get_gsc_ranking_movements to discover queries with significant position losses.
3. Call get_ga4_landing_pages to identify the top losing landing pages.
4. Formulate specific diagnostic findings explaining whether the drop was site-wide, algorithm-related, or page-specific.`,
            },
          },
        ],
      };
    }
  );

  // 3. keyword_opportunity_review
  server.prompt(
    'keyword_opportunity_review',
    'Identify and prioritise striking distance keywords (positions 4-20) for quick ranking and traffic gains.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
    },
    async (args) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please identify high-potential keyword opportunities for website ID "${args.websiteId}".

Recommended procedure:
1. Call get_keyword_opportunities with a minimum impression threshold.
2. Segment queries into Page 1 striking distance (positions 4-10) and Page 2 striking distance (positions 11-20).
3. Recommend specific on-page optimizations (title tags, H1/H2 headings, internal links) to push these queries into the top 3.`,
            },
          },
        ],
      };
    }
  );

  // 4. landing_page_review
  server.prompt(
    'landing_page_review',
    'Evaluate top organic landing pages for search visibility and on-page usability friction.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Start date (YYYY-MM-DD)'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('End date (YYYY-MM-DD)'),
    },
    async (args) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Review the performance and UX friction of top landing pages for website ID "${args.websiteId}" (${args.startDate} to ${args.endDate}).

Recommended procedure:
1. Call get_ga4_landing_pages to determine top traffic pages.
2. Call get_clarity_page_insights to identify which top pages have rage clicks or dead clicks.
3. Highlight high-traffic pages with poor engagement or usability barriers.`,
            },
          },
        ],
      };
    }
  );

  // 5. monthly_seo_review
  server.prompt(
    'monthly_seo_review',
    'Synthesise monthly performance for client executive presentations.',
    {
      websiteId: z.string().uuid().describe('Target website unique identifier'),
      currentStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Month start date'),
      currentEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Month end date'),
      compareStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Previous month start date'),
      compareEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Previous month end date'),
    },
    async (args) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Prepare an executive monthly SEO performance review for website ID "${args.websiteId}".

Recommended procedure:
1. Call compare_website_periods to compute MoM changes across GA4 and GSC.
2. Call get_seo_findings to review resolved vs active findings.
3. Synthesise an executive summary structured into: Key Highlights, Traffic Shifts, Keyword Wins, Usability Insights, and Next Month Strategic Priorities.`,
            },
          },
        ],
      };
    }
  );
}
