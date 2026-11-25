// backend/src/modules/ai/prompts/intent-prompts.js
// Intent-specific prompt templates. Data comes first and the question last,
// which small local models follow far more reliably than the reverse.

import { AI_INTENTS } from '../services/ai-context.service.js';

const DIRECTIVES = {
  [AI_INTENTS.TRAFFIC_ANALYSIS]:
    'Focus on GA4 sessions, organic sessions, users, engagement and conversions, and which pages gained or lost traffic. Name the likely drivers.',
  [AI_INTENTS.KEYWORD_OPPORTUNITIES]:
    'Focus on Search Console queries: striking-distance keywords (position 4-20), queries with high impressions but low CTR, and the pages that rank. Suggest title, meta description and content changes.',
  [AI_INTENTS.USER_BEHAVIOUR]:
    'Focus on Microsoft Clarity: dead clicks, rage clicks, quick backs, excessive scrolling and script errors, and which pages have the most friction.',
  [AI_INTENTS.SEO_FINDINGS]:
    'Focus on the open SEO findings: explain each important one, why it matters and how to fix it, most severe first.',
  [AI_INTENTS.GENERAL_PERFORMANCE]:
    'Give a short overall health check across GA4, Search Console and Clarity, then the top priorities.',
};

export function buildIntentUserPrompt(intent, userMessage, contextString) {
  const directive = DIRECTIVES[intent] || DIRECTIVES[AI_INTENTS.GENERAL_PERFORMANCE];

  return `DATA (synced from this agency's GA4, Google Search Console and Microsoft Clarity):
"""
${contextString || 'No data available.'}
"""

QUESTION: ${userMessage}

HOW TO ANSWER:
- ${directive}
- Use only the DATA above. For every query, page or metric you mention, quote its exact numbers from the DATA (for example: "content optimization services" - position 5.2, 208 impressions, 4 clicks).
- If DATA COVERAGE says % changes are not reliable, do not describe them as growth or decline.
- If the DATA does not contain what the question needs (for example an integration is NOT connected or has no rows), say so plainly instead of guessing.
- Keep it focused: a short answer with headings or bullets, then 3-5 numbered next steps.`;
}
