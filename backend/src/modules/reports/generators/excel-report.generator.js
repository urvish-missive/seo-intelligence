// backend/src/modules/reports/generators/excel-report.generator.js
// Professional Multi-Sheet Excel Workbook Generator using ExcelJS with Formula Injection Protection.

import ExcelJS from 'exceljs';
import fs from 'fs';
import { reportStorageService } from '../services/report-storage.service.js';
import { sanitizeCellValue } from '../utils/formula-sanitizer.js';
import { formatDateHuman } from '../utils/date-range.utils.js';
import logger from '../../../utils/logger.js';

export class ExcelReportGenerator {
  /**
   * Generate formatted Excel workbook and write to storage.
   */
  async generate(reportData, filename) {
    const { absolutePath } = reportStorageService.resolveFilePath(filename);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = sanitizeCellValue(reportData.branding.agencyName);
    workbook.lastModifiedBy = 'Missive SEO Intelligence Platform';
    workbook.created = new Date();
    workbook.modified = new Date();

    // 1. Overview Sheet
    this.buildOverviewSheet(workbook, reportData);

    // 2. GA4 Performance Sheet
    if (reportData.metrics.ga4.available) {
      this.buildGa4Sheet(workbook, reportData);
    }

    // 3. GSC Performance Sheet
    if (reportData.metrics.gsc.available) {
      this.buildGscSheet(workbook, reportData);
    }

    // 4. Keyword Opportunities Sheet
    if (reportData.metrics.gsc.opportunities.length > 0) {
      this.buildOpportunitiesSheet(workbook, reportData);
    }

    // 5. Landing Pages Sheet
    if (reportData.metrics.ga4.landingPages.length > 0 || reportData.metrics.gsc.pages.length > 0) {
      this.buildLandingPagesSheet(workbook, reportData);
    }

    // 6. SEO Findings Sheet
    if (reportData.metrics.seoFindings.length > 0) {
      this.buildSeoFindingsSheet(workbook, reportData);
    }

    // 7. Clarity UX Sheet
    if (reportData.metrics.clarity.available && reportData.metrics.clarity.summary) {
      this.buildClaritySheet(workbook, reportData);
    }

    await workbook.xlsx.writeFile(absolutePath);

    const stats = fs.statSync(absolutePath);
    logger.info(`Generated Excel report ${filename} (${stats.size} bytes)`);

    return {
      filename,
      absolutePath,
      fileSize: stats.size,
    };
  }

  buildOverviewSheet(workbook, reportData) {
    const sheet = workbook.addWorksheet('Overview', {
      views: [{ showGridLines: true }],
    });

    sheet.columns = [
      { header: 'Property', key: 'prop', width: 28 },
      { header: 'Value', key: 'val', width: 45 },
      { header: 'Notes / Comparison', key: 'notes', width: 35 },
    ];

    this.styleHeaderRow(sheet.getRow(1));

    const rows = [
      { prop: 'Report Type', val: sanitizeCellValue(reportData.metadata.reportType), notes: '' },
      { prop: 'Website Name', val: sanitizeCellValue(reportData.metadata.websiteName), notes: '' },
      { prop: 'Domain', val: sanitizeCellValue(reportData.metadata.domain), notes: '' },
      { prop: 'Client Name', val: sanitizeCellValue(reportData.metadata.clientName), notes: '' },
      { prop: 'Reporting Period', val: `${reportData.metadata.periodStart} to ${reportData.metadata.periodEnd}`, notes: `${formatDateHuman(reportData.metadata.periodStart)} – ${formatDateHuman(reportData.metadata.periodEnd)}` },
      { prop: 'Comparison Period', val: reportData.metadata.comparisonStart ? `${reportData.metadata.comparisonStart} to ${reportData.metadata.comparisonEnd}` : 'None', notes: 'Preceding equivalent interval' },
      { prop: 'Generated At', val: sanitizeCellValue(reportData.metadata.generatedAt), notes: 'System timestamp' },
      { prop: 'Prepared By Agency', val: sanitizeCellValue(reportData.branding.agencyName), notes: sanitizeCellValue(reportData.branding.website || '') },
      { prop: 'GA4 Sessions', val: reportData.metrics.ga4.summary?.sessions || 0, notes: `${reportData.metrics.ga4.comparison?.sessionsChangePercent?.toFixed(1) || 0}% change` },
      { prop: 'GA4 Users', val: reportData.metrics.ga4.summary?.totalUsers || 0, notes: `${reportData.metrics.ga4.comparison?.usersChangePercent?.toFixed(1) || 0}% change` },
      { prop: 'GSC Organic Clicks', val: reportData.metrics.gsc.summary?.clicks || 0, notes: `${reportData.metrics.gsc.comparison?.clicksChangePercent?.toFixed(1) || 0}% change` },
      { prop: 'GSC Impressions', val: reportData.metrics.gsc.summary?.impressions || 0, notes: `${reportData.metrics.gsc.comparison?.impressionsChangePercent?.toFixed(1) || 0}% change` },
      { prop: 'GSC Avg CTR', val: Number(((reportData.metrics.gsc.summary?.ctr || 0) / 100).toFixed(4)), notes: 'Click-Through Rate' },
      { prop: 'GSC Avg Position', val: Number((reportData.metrics.gsc.summary?.averagePosition || 0).toFixed(1)), notes: 'Average rank position' },
      { prop: 'Active SEO Findings', val: reportData.metrics.seoFindings.length, notes: 'Deterministic engine audit issues' },
    ];

    rows.forEach(r => sheet.addRow(r));

    // Number format rows
    sheet.getCell('B10').numFmt = '#,##0';
    sheet.getCell('B11').numFmt = '#,##0';
    sheet.getCell('B12').numFmt = '#,##0';
    sheet.getCell('B13').numFmt = '#,##0';
    sheet.getCell('B14').numFmt = '0.0%';
    sheet.getCell('B15').numFmt = '0.0';
  }

  buildGa4Sheet(workbook, reportData) {
    const sheet = workbook.addWorksheet('GA4 Traffic', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: true }],
    });

    sheet.columns = [
      { header: 'Acquisition Source', key: 'source', width: 25 },
      { header: 'Medium', key: 'medium', width: 18 },
      { header: 'Channel Group', key: 'channel', width: 22 },
      { header: 'Sessions', key: 'sessions', width: 15 },
      { header: 'Total Users', key: 'users', width: 15 },
      { header: 'Engagement Rate', key: 'engagementRate', width: 18 },
      { header: 'Bounce Rate', key: 'bounceRate', width: 16 },
    ];

    this.styleHeaderRow(sheet.getRow(1));
    sheet.autoFilter = 'A1:G1';

    const sources = reportData.metrics.ga4.sources || [];
    sources.forEach(s => {
      const row = sheet.addRow({
        source: sanitizeCellValue(s.source || 'direct'),
        medium: sanitizeCellValue(s.medium || '(none)'),
        channel: sanitizeCellValue(s.channelGroup || s.defaultChannelGroup || 'Direct'),
        sessions: Number(s.sessions || 0),
        users: Number(s.totalUsers || s.users || 0),
        engagementRate: Number(((s.engagementRate || 0) / 100).toFixed(4)),
        bounceRate: Number(((s.bounceRate || 0) / 100).toFixed(4)),
      });

      row.getCell('D').numFmt = '#,##0';
      row.getCell('E').numFmt = '#,##0';
      row.getCell('F').numFmt = '0.0%';
      row.getCell('G').numFmt = '0.0%';
    });
  }

  buildGscSheet(workbook, reportData) {
    const sheet = workbook.addWorksheet('GSC Queries', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: true }],
    });

    sheet.columns = [
      { header: 'Search Query', key: 'query', width: 38 },
      { header: 'Clicks', key: 'clicks', width: 14 },
      { header: 'Impressions', key: 'impressions', width: 16 },
      { header: 'CTR', key: 'ctr', width: 14 },
      { header: 'Position', key: 'position', width: 14 },
    ];

    this.styleHeaderRow(sheet.getRow(1));
    sheet.autoFilter = 'A1:E1';

    const queries = reportData.metrics.gsc.queries || [];
    queries.forEach(q => {
      const row = sheet.addRow({
        query: sanitizeCellValue(q.query),
        clicks: Number(q.clicks || 0),
        impressions: Number(q.impressions || 0),
        ctr: Number(((q.ctr || 0) / 100).toFixed(4)),
        position: Number((q.position || 0).toFixed(1)),
      });

      row.getCell('B').numFmt = '#,##0';
      row.getCell('C').numFmt = '#,##0';
      row.getCell('D').numFmt = '0.0%';
      row.getCell('E').numFmt = '0.0';
    });
  }

  buildOpportunitiesSheet(workbook, reportData) {
    const sheet = workbook.addWorksheet('Keyword Opportunities', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: true }],
    });

    sheet.columns = [
      { header: 'Opportunity Query', key: 'query', width: 35 },
      { header: 'Current Position', key: 'position', width: 18 },
      { header: 'Impressions', key: 'impressions', width: 16 },
      { header: 'Clicks', key: 'clicks', width: 14 },
      { header: 'Current CTR', key: 'ctr', width: 15 },
      { header: 'Opportunity Category', key: 'category', width: 28 },
      { header: 'Strategic Recommendation', key: 'recommendation', width: 55 },
    ];

    this.styleHeaderRow(sheet.getRow(1));
    sheet.autoFilter = 'A1:G1';

    const opps = reportData.metrics.gsc.opportunities || [];
    opps.forEach(o => {
      const row = sheet.addRow({
        query: sanitizeCellValue(o.query),
        position: Number((o.position || 0).toFixed(1)),
        impressions: Number(o.impressions || 0),
        clicks: Number(o.clicks || 0),
        ctr: Number(((o.ctr || 0) / 100).toFixed(4)),
        category: sanitizeCellValue(o.opportunityType),
        recommendation: sanitizeCellValue(o.recommendation),
      });

      row.getCell('B').numFmt = '0.0';
      row.getCell('C').numFmt = '#,##0';
      row.getCell('D').numFmt = '#,##0';
      row.getCell('E').numFmt = '0.0%';
    });
  }

  buildLandingPagesSheet(workbook, reportData) {
    const sheet = workbook.addWorksheet('Landing Pages', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: true }],
    });

    sheet.columns = [
      { header: 'Landing Page URL / Path', key: 'path', width: 45 },
      { header: 'Sessions (GA4)', key: 'sessions', width: 16 },
      { header: 'Users (GA4)', key: 'users', width: 15 },
      { header: 'Bounce Rate', key: 'bounceRate', width: 15 },
    ];

    this.styleHeaderRow(sheet.getRow(1));
    sheet.autoFilter = 'A1:D1';

    const pages = reportData.metrics.ga4.landingPages || [];
    pages.forEach(p => {
      const row = sheet.addRow({
        path: sanitizeCellValue(p.pagePath || p.landingPage || '/'),
        sessions: Number(p.sessions || 0),
        users: Number(p.users || p.totalUsers || 0),
        bounceRate: Number(((p.bounceRate || 0) / 100).toFixed(4)),
      });

      row.getCell('B').numFmt = '#,##0';
      row.getCell('C').numFmt = '#,##0';
      row.getCell('D').numFmt = '0.0%';
    });
  }

  buildSeoFindingsSheet(workbook, reportData) {
    const sheet = workbook.addWorksheet('SEO Findings', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: true }],
    });

    sheet.columns = [
      { header: 'Severity', key: 'severity', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Issue Title', key: 'title', width: 35 },
      { header: 'Target / URL', key: 'target', width: 40 },
      { header: 'Category / Engine', key: 'type', width: 22 },
      { header: 'Detailed Recommendation', key: 'description', width: 60 },
    ];

    this.styleHeaderRow(sheet.getRow(1));
    sheet.autoFilter = 'A1:F1';

    const findings = reportData.metrics.seoFindings || [];
    findings.forEach(f => {
      sheet.addRow({
        severity: sanitizeCellValue(f.severity || 'INFO'),
        status: sanitizeCellValue(f.status || 'OPEN'),
        title: sanitizeCellValue(f.title),
        target: sanitizeCellValue(f.affectedTarget || f.target || 'Global Website'),
        type: sanitizeCellValue(f.type || 'TECHNICAL'),
        description: sanitizeCellValue(f.description || f.recommendation || ''),
      });
    });
  }

  buildClaritySheet(workbook, reportData) {
    const sheet = workbook.addWorksheet('Clarity UX', {
      views: [{ showGridLines: true }],
    });

    sheet.columns = [
      { header: 'Behavioral UX Metric', key: 'metric', width: 30 },
      { header: 'Total Occurrences', key: 'count', width: 22 },
      { header: 'Insight & Assessment', key: 'insight', width: 45 },
    ];

    this.styleHeaderRow(sheet.getRow(1));

    const clarity = reportData.metrics.clarity.summary || {};
    const rows = [
      { metric: 'Dead Clicks', count: clarity.deadClicks || 0, insight: 'Clicks with no DOM change or navigation' },
      { metric: 'Rage Clicks', count: clarity.rageClicks || 0, insight: 'Rapid repeated clicks signaling severe UX friction' },
      { metric: 'Quick Backs', count: clarity.quickbacks || 0, insight: 'Immediate return to previous page' },
      { metric: 'Script Errors', count: clarity.scriptErrors || 0, insight: 'Frontend JavaScript exceptions recorded' },
    ];

    rows.forEach(r => {
      const row = sheet.addRow({
        metric: sanitizeCellValue(r.metric),
        count: Number(r.count),
        insight: sanitizeCellValue(r.insight),
      });
      row.getCell('B').numFmt = '#,##0';
    });
  }

  styleHeaderRow(row) {
    row.eachCell(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1E293B' }, // Dark slate
      };
      cell.font = {
        name: 'Arial',
        size: 10,
        bold: true,
        color: { argb: 'FFFFFF' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'left',
      };
      cell.border = {
        bottom: { style: 'medium', color: { argb: '0F172A' } },
      };
    });
    row.height = 24;
  }
}

export const excelReportGenerator = new ExcelReportGenerator();
