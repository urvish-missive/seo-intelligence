// ai-engine/src/prompts/trafficAnalysis.js

export function buildTrafficAnalysisPrompt(data) {
  const { currentPeriod, previousPeriod, changes, websiteDomain, dateRange } = data;

  return `Analyse the organic traffic performance for ${websiteDomain}.

Period: ${dateRange.start} to ${dateRange.end}
Comparison: ${dateRange.comparisonStart} to ${dateRange.comparisonEnd}

CURRENT PERIOD METRICS:
${JSON.stringify(currentPeriod, null, 2)}

PREVIOUS PERIOD METRICS:
${JSON.stringify(previousPeriod, null, 2)}

PRE-CALCULATED CHANGES:
${JSON.stringify(changes, null, 2)}

Provide:
1. Summary of traffic performance (2-3 sentences)
2. Significant changes (positive and negative)
3. Channels or pages driving changes
4. Recommended actions based on what the data shows

Remember: label all recommendations as suggestions, not certainties.`;
}
