// backend/src/modules/seo-analysis/engines/behaviour-analysis.engine.js
// Microsoft Clarity behavioral UX telemetry analysis engine.

import { RULE_TYPES, DEFAULT_THRESHOLDS } from '../rules/analysis-thresholds.js';
import { generateFindingFingerprint } from '../utils/fingerprint.utils.js';

export class BehaviourAnalysisEngine {
  constructor(customThresholds = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };
  }

  /**
   * Analyze stored Clarity daily and page metrics for behavioral friction.
   */
  async analyze({
    workspaceId,
    clientId,
    websiteId,
    clarityDailyMetrics = [],
    clarityPageMetrics = [],
    latestSnapshot = null,
  }) {
    const findings = [];

    // Aggregate Clarity Daily Metrics
    const totalSessions = clarityDailyMetrics.reduce((acc, r) => acc + (r.sessions || 0), 0);
    const totalDeadClicks = clarityDailyMetrics.reduce((acc, r) => acc + (r.deadClickCount || 0), 0);
    const totalRageClicks = clarityDailyMetrics.reduce((acc, r) => acc + (r.rageClickCount || 0), 0);
    const totalQuickbacks = clarityDailyMetrics.reduce((acc, r) => acc + (r.quickbackClickCount || 0), 0);
    const totalExcessiveScroll = clarityDailyMetrics.reduce((acc, r) => acc + (r.excessiveScrollCount || 0), 0);
    const totalScriptErrors = clarityDailyMetrics.reduce((acc, r) => acc + (r.scriptErrorCount || 0), 0);

    if (totalSessions < this.thresholds.CLARITY_MIN_SESSIONS) {
      return findings; // Insufficient behavioral data
    }

    const deadClickRate = (totalDeadClicks / totalSessions) * 100;
    const rageClickRate = (totalRageClicks / totalSessions) * 100;

    // 1. ELEVATED DEAD CLICKS (Clicks on non-interactive elements)
    if (deadClickRate >= this.thresholds.CLARITY_DEAD_CLICK_RATE_PCT) {
      findings.push({
        workspaceId,
        clientId,
        websiteId,
        type: RULE_TYPES.BEHAVIOUR_FRICTION,
        fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.BEHAVIOUR_FRICTION, 'SITE', 'CLARITY_DEAD_CLICKS'),
        title: `High Dead Click Rate (${deadClickRate.toFixed(1)}%) Detected`,
        description: `Users frequently click on non-interactive design elements (${totalDeadClicks.toLocaleString()} dead clicks across ${totalSessions.toLocaleString()} sessions), creating confusion.`,
        severity: 'MEDIUM',
        priority: 'P2',
        confidence: 'HIGH',
        affectedTarget: 'Whole Website',
        targetType: 'SITE',
        currentValue: parseFloat(deadClickRate.toFixed(1)),
        previousValue: this.thresholds.CLARITY_DEAD_CLICK_RATE_PCT,
        changeValue: parseFloat((deadClickRate - this.thresholds.CLARITY_DEAD_CLICK_RATE_PCT).toFixed(1)),
        changePercentage: null,
        evidenceJson: JSON.stringify({
          source: 'Microsoft Clarity Snapshot',
          snapshotWindow: latestSnapshot
            ? { start: latestSnapshot.windowStart, end: latestSnapshot.windowEnd, preset: latestSnapshot.preset }
            : null,
          totalSessions,
          deadClicks: totalDeadClicks,
          deadClickRate: parseFloat(deadClickRate.toFixed(1)),
          thresholdRate: this.thresholds.CLARITY_DEAD_CLICK_RATE_PCT,
        }),
        suggestedAction:
          'Audit non-clickable badges, styled cards, or unlinked text that resembles buttons. Convert them to active links or modify their CSS styling to remove hover effects.',
        ruleVersion: '1.0.0',
      });
    }

    // 2. ELEVATED RAGE CLICKS (Rapid clicking indicating frustration or lag)
    if (rageClickRate >= this.thresholds.CLARITY_RAGE_CLICK_RATE_PCT) {
      findings.push({
        workspaceId,
        clientId,
        websiteId,
        type: RULE_TYPES.BEHAVIOUR_FRICTION,
        fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.BEHAVIOUR_FRICTION, 'SITE', 'CLARITY_RAGE_CLICKS'),
        title: `Elevated Rage Clicks (${totalRageClicks.toLocaleString()} events)`,
        description: `Rapid repeated clicks observed on key pages (${rageClickRate.toFixed(1)}% session rate), signaling broken interactive elements or sluggish button responsiveness.`,
        severity: 'HIGH',
        priority: 'P1',
        confidence: 'HIGH',
        affectedTarget: 'Whole Website',
        targetType: 'SITE',
        currentValue: parseFloat(rageClickRate.toFixed(1)),
        previousValue: this.thresholds.CLARITY_RAGE_CLICK_RATE_PCT,
        changeValue: parseFloat((rageClickRate - this.thresholds.CLARITY_RAGE_CLICK_RATE_PCT).toFixed(1)),
        changePercentage: null,
        evidenceJson: JSON.stringify({
          source: 'Microsoft Clarity Snapshot',
          totalSessions,
          rageClicks: totalRageClicks,
          rageClickRate: parseFloat(rageClickRate.toFixed(1)),
          thresholdRate: this.thresholds.CLARITY_RAGE_CLICK_RATE_PCT,
        }),
        suggestedAction:
          'Inspect interactive buttons, submission forms, and accordion toggles for event listener delays or unhandled exceptions.',
        ruleVersion: '1.0.0',
      });
    }

    // 3. ELEVATED SCRIPT ERRORS
    if (totalScriptErrors >= 10) {
      findings.push({
        workspaceId,
        clientId,
        websiteId,
        type: RULE_TYPES.BEHAVIOUR_FRICTION,
        fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.BEHAVIOUR_FRICTION, 'SITE', 'CLARITY_SCRIPT_ERRORS'),
        title: `Client-Side JavaScript Errors Detected (${totalScriptErrors} errors)`,
        description: `Clarity telemetry captured ${totalScriptErrors} uncaught JavaScript errors during visitor browsing sessions.`,
        severity: 'HIGH',
        priority: 'P1',
        confidence: 'HIGH',
        affectedTarget: 'Whole Website',
        targetType: 'SITE',
        currentValue: totalScriptErrors,
        previousValue: 0,
        changeValue: totalScriptErrors,
        changePercentage: null,
        evidenceJson: JSON.stringify({
          source: 'Microsoft Clarity Snapshot',
          scriptErrorCount: totalScriptErrors,
          totalSessions,
        }),
        suggestedAction:
          'Inspect browser developer console logs on core templates to identify and resolve broken client-side scripts.',
        ruleVersion: '1.0.0',
      });
    }

    // 4. Page-level Friction Hotspots
    for (const page of clarityPageMetrics) {
      if (page.sessions >= 15 && (page.rageClicks >= 5 || page.deadClicks >= 10)) {
        findings.push({
          workspaceId,
          clientId,
          websiteId,
          type: RULE_TYPES.BEHAVIOUR_FRICTION,
          fingerprint: generateFindingFingerprint(websiteId, RULE_TYPES.BEHAVIOUR_FRICTION, page.page, 'PAGE_FRICTION_HOTSPOT'),
          title: `User Friction Hotspot on ${page.page}`,
          description: `Page exhibits concentrated user struggle with ${page.rageClicks} rage clicks and ${page.deadClicks} dead clicks over ${page.sessions} sessions.`,
          severity: 'MEDIUM',
          priority: 'P2',
          confidence: 'HIGH',
          affectedTarget: page.page,
          targetType: 'PAGE',
          currentValue: page.rageClicks + page.deadClicks,
          previousValue: 0,
          changeValue: page.rageClicks + page.deadClicks,
          changePercentage: null,
          evidenceJson: JSON.stringify({
            page: page.page,
            sessions: page.sessions,
            rageClicks: page.rageClicks,
            deadClicks: page.deadClicks,
            quickBacks: page.quickBacks,
            avgScrollDepth: page.avgScrollDepth,
          }),
          suggestedAction:
            'Review Clarity heatmaps and session recordings for this specific page URL to diagnose the exact visual element causing friction.',
          ruleVersion: '1.0.0',
        });
      }
    }

    return findings;
  }
}

export default BehaviourAnalysisEngine;
