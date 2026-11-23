// ai-engine/src/prompts/reportSummary.js

export function buildReportSummaryPrompt(data) {
  const { reportData, websiteDomain, clientName, reportType, periodStart, periodEnd } = data;

  return `Generate an executive summary for the ${reportType} SEO report.

Client: ${clientName}
Website: ${websiteDomain}
Period: ${periodStart} to ${periodEnd}

REPORT DATA:
${JSON.stringify(reportData, null, 2)}

Write an executive summary (200-300 words) that:
1. Opens with the most important performance highlight
2. Covers organic traffic trend
3. Covers search visibility (clicks and impressions)
4. Mentions top keyword movements
5. Notes key landing page changes
6. Closes with the top 2-3 priority actions

Write in professional agency tone suitable for client presentation.
Base everything on the provided data. Do not speculate.`;
}
