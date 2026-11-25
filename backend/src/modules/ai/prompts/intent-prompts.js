// backend/src/modules/ai/prompts/intent-prompts.js
// Intent-specific prompt templates. Data comes first and the question last,
// which small local models follow far more reliably than the reverse.

import { AI_INTENTS } from '../services/ai-context.service.js';

const DIRECTIVES = {
  [AI_INTENTS.TRAFFIC_ANALYSIS]:
    'For a country-specific visit question, use only the GA4 COUNTRY DATA section. Report sessions as visits and state the exact date range. Do not call sessions people; if the data only has daily user totals, explain that it cannot provide deduplicated unique people for the whole period. For other questions, focus on GA4 sessions, users, engagement and conversions.',
  [AI_INTENTS.KEYWORD_OPPORTUNITIES]:
    'For a question about website clicks on a specific date, use only the Google Search Console clicks value for that exact date and name Google Search Console as the source. Explain that these are search-result clicks to the website, not unique people or clicks on page elements. Otherwise focus on Search Console queries, rankings and opportunities.',
  [AI_INTENTS.USER_BEHAVIOUR]:
    'Answer Microsoft Clarity questions from the Clarity section only. For a session-count question, give the exact requested-period session total first and state its date coverage. Do not substitute GA4 sessions or describe Clarity as Google Analytics.',
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
- If the DATA says an integration is connected, never claim it is disconnected. Distinguish a workspace-level connection from a website-level mapping when the DATA says so.
- For a direct factual question, answer directly and do not add generic next steps. Only give recommendations when the user asks for them.`;
}
