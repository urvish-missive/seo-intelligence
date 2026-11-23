// ai-engine/src/index.js
// AI Engine entry point — exports the engine for use by the backend.
// This module is imported directly by the backend server in the monorepo setup.
// It is NOT a standalone HTTP server.

import { OllamaClient } from './ollama/client.js';
import { checkModelHealth } from './ollama/health.js';

export { OllamaClient, checkModelHealth };
export { buildSystemPrompt } from './prompts/system.js';
export { buildTrafficAnalysisPrompt } from './prompts/trafficAnalysis.js';
export { buildKeywordOpportunityPrompt } from './prompts/keywordOpportunity.js';
export { buildReportSummaryPrompt } from './prompts/reportSummary.js';
export { buildContextFromData } from './context/contextBuilder.js';
export { orchestrateToolCall } from './orchestration/toolOrchestrator.js';
