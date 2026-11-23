// backend/src/modules/ai/prompts/intent-prompts.js
// Intent-specific prompt templates tailoring the query framing.

import { AI_INTENTS } from '../services/ai-context.service.js';

export function buildIntentUserPrompt(intent, userMessage, contextString) {
  let instruction = '';

  switch (intent) {
    case AI_INTENTS.TRAFFIC_ANALYSIS:
      instruction = `Focus your analysis on organic traffic fluctuations, GA4 sessions, engagement rates, bounce rates, and landing page movements between periods. Identify the primary drivers behind traffic gains or drops.`;
      break;

    case AI_INTENTS.KEYWORD_OPPORTUNITIES:
      instruction = `Focus on Google Search Console queries, striking distance opportunities (ranking positions 4-20 with high impressions), CTR deficits, and keyword momentum. Suggest content and metadata optimisations to capture top 3 rankings.`;
      break;

    case AI_INTENTS.USER_BEHAVIOUR:
      instruction = `Focus on Microsoft Clarity behavioural analytics: dead clicks, rage clicks, quick backs, excessive scrolling, and JavaScript errors. Pinpoint UX friction and usability bottlenecks that harm organic conversion rates.`;
      break;

    case AI_INTENTS.SEO_FINDINGS:
      instruction = `Focus on the deterministic SEO findings and anomalies detected by our analysis engine. Explain the root cause of these issues, their severity/impact score, and how the team should remediate them.`;
      break;

    case AI_INTENTS.GENERAL_PERFORMANCE:
    default:
      instruction = `Provide a comprehensive cross-platform synthesis across Google Analytics 4, Google Search Console, and Microsoft Clarity. Summarise current website health and key priorities.`;
      break;
  }

  return `USER QUESTION:
"${userMessage}"

SPECIFIC DIRECTIVE:
${instruction}

GROUNDED CONTEXT DATA (MySQL Analytics & Deterministic Findings):
${contextString}

Provide an expert, structured SEO consultation answering the user's question with direct reference to the data above.`;
}
