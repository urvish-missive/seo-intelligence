// backend/src/modules/seo-analysis/services/seo-finding.service.js
// Finding lifecycle management, filtering, searching, and history audit service.

import prisma from '../../../config/database.js';
import { FINDING_STATUSES } from '../rules/analysis-thresholds.js';
import { NotFoundError, BadRequestError } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';

export class SEOFindingService {
  /**
   * Get paginated findings for a website with optional filters.
   */
  async getFindings(workspaceId, websiteId, options = {}) {
    const {
      type,
      severity,
      priority,
      status,
      search,
      limit = 50,
      offset = 0,
      sortBy = 'detectedAt',
      sortOrder = 'desc',
    } = options;

    const where = {
      workspaceId,
      websiteId,
    };

    if (type) where.type = type;
    if (severity) where.severity = severity;
    if (priority) where.priority = priority;
    if (status) where.status = status;

    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search.trim() } },
        { description: { contains: search.trim() } },
        { affectedTarget: { contains: search.trim() } },
      ];
    }

    const [total, findings] = await Promise.all([
      prisma.sEOFinding.count({ where }),
      prisma.sEOFinding.findMany({
        where,
        take: parseInt(limit, 10),
        skip: parseInt(offset, 10),
        orderBy: { [sortBy]: sortOrder },
        include: {
          history: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: { changedBy: { select: { id: true, name: true, email: true } } },
          },
        },
      }),
    ]);

    return {
      total,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      findings: findings.map((f) => ({
        ...f,
        evidence: this._parseJson(f.evidenceJson),
      })),
    };
  }

  /**
   * Get single finding by ID with complete lifecycle history.
   */
  async getFindingById(workspaceId, findingId) {
    const finding = await prisma.sEOFinding.findFirst({
      where: { id: findingId, workspaceId },
      include: {
        website: { select: { id: true, domain: true, name: true } },
        history: {
          orderBy: { createdAt: 'desc' },
          include: { changedBy: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    if (!finding) {
      throw new NotFoundError(`Finding with ID ${findingId} not found`);
    }

    return {
      ...finding,
      evidence: this._parseJson(finding.evidenceJson),
    };
  }

  /**
   * Update finding lifecycle status with user attribution.
   */
  async updateFindingStatus(workspaceId, findingId, { status, note, userId }) {
    const validStatuses = Object.values(FINDING_STATUSES);
    if (!validStatuses.includes(status)) {
      throw new BadRequestError(`Invalid status "${status}". Allowed: ${validStatuses.join(', ')}`);
    }

    const finding = await prisma.sEOFinding.findFirst({
      where: { id: findingId, workspaceId },
    });

    if (!finding) {
      throw new NotFoundError(`Finding with ID ${findingId} not found`);
    }

    const previousStatus = finding.status;
    const resolvedAt = status === FINDING_STATUSES.RESOLVED ? new Date() : finding.resolvedAt;

    // Update finding record
    const updatedFinding = await prisma.sEOFinding.update({
      where: { id: findingId },
      data: {
        status,
        resolvedAt,
        updatedAt: new Date(),
      },
    });

    // Record lifecycle transition in history table
    await prisma.sEOFindingHistory.create({
      data: {
        findingId,
        previousStatus,
        newStatus: status,
        changedById: userId || null,
        note: note || `Status updated from ${previousStatus} to ${status}`,
      },
    });

    logger.info(`[SEOFinding] ${findingId} status changed: ${previousStatus} -> ${status} by user ${userId}`);

    return {
      ...updatedFinding,
      evidence: this._parseJson(updatedFinding.evidenceJson),
    };
  }

  /**
   * Get summary breakdown counts for the website's SEO analysis dashboard.
   */
  async getWebsiteOverviewStats(workspaceId, websiteId) {
    const findings = await prisma.sEOFinding.findMany({
      where: { workspaceId, websiteId },
      select: {
        id: true,
        type: true,
        severity: true,
        priority: true,
        status: true,
        detectedAt: true,
      },
    });

    const summary = {
      totalFindings: findings.length,
      criticalFindings: 0,
      highPriorityFindings: 0,
      newOpportunities: 0,
      openIssues: 0,
      resolvedIssues: 0,
      bySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 },
      byType: {},
      byStatus: {},
      lastAnalysisDate: null,
    };

    findings.forEach((f) => {
      // Severity counts
      if (summary.bySeverity[f.severity] !== undefined) {
        summary.bySeverity[f.severity] += 1;
      }
      if (f.severity === 'CRITICAL') summary.criticalFindings += 1;

      // Priority counts
      if (f.priority === 'P1' || f.priority === 'P2') {
        summary.highPriorityFindings += 1;
      }

      // Type counts
      summary.byType[f.type] = (summary.byType[f.type] || 0) + 1;
      if (f.type === 'KEYWORD_OPPORTUNITY') summary.newOpportunities += 1;

      // Status counts
      summary.byStatus[f.status] = (summary.byStatus[f.status] || 0) + 1;
      if (['NEW', 'OPEN', 'IN_PROGRESS', 'REOPENED'].includes(f.status)) {
        summary.openIssues += 1;
      } else if (f.status === 'RESOLVED') {
        summary.resolvedIssues += 1;
      }

      // Track latest detection date
      if (!summary.lastAnalysisDate || new Date(f.detectedAt) > new Date(summary.lastAnalysisDate)) {
        summary.lastAnalysisDate = f.detectedAt;
      }
    });

    return summary;
  }

  _parseJson(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
}

export const seoFindingService = new SEOFindingService();
export default seoFindingService;
