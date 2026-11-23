// ai-engine/src/prompts/keywordOpportunity.js

export function buildKeywordOpportunityPrompt(data) {
  const { opportunities, websiteDomain, dateRange } = data;

  return `Analyse keyword opportunities for ${websiteDomain}.

Period: ${dateRange.start} to ${dateRange.end}

KEYWORD OPPORTUNITIES (pre-calculated):
${JSON.stringify(opportunities, null, 2)}

For each opportunity category, explain:
1. What the data shows
2. Why this represents an opportunity
3. Specific suggested action

Important:
- These are GSC-reported queries only (actual search data)
- Do not invent search volume or difficulty estimates
- Do not reference third-party keyword tools
- Label all suggestions as recommendations for investigation`;
}
