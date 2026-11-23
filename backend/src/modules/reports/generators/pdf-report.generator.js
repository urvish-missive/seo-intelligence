// backend/src/modules/reports/generators/pdf-report.generator.js
// Professional Agency PDF Report Generator using PDFKit.

import PDFDocument from 'pdfkit';
import fs from 'fs';
import { reportStorageService } from '../services/report-storage.service.js';
import { formatDateHuman, formatNumber, formatPercentage, formatPosition } from '../utils/date-range.utils.js';
import logger from '../../../utils/logger.js';

export class PdfReportGenerator {
  /**
   * Render and save complete PDF report to disk.
   */
  async generate(reportData, filename) {
    const { absolutePath } = reportStorageService.resolveFilePath(filename);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
          bufferPages: true,
          info: {
            Title: `${reportData.metadata.reportType} - ${reportData.metadata.websiteName}`,
            Author: reportData.branding.agencyName,
            Subject: 'SEO Intelligence Performance Report',
            Keywords: 'SEO, Google Analytics, Search Console, Clarity',
          },
        });

        const stream = fs.createWriteStream(absolutePath);
        doc.pipe(stream);

        const primaryColor = reportData.branding.brandPrimaryColor || '#4f46e5';
        const secondaryColor = reportData.branding.brandSecondaryColor || '#0f172a';

        // 1. Cover Page
        this.renderCoverPage(doc, reportData, primaryColor, secondaryColor);

        // 2. Executive Summary Page
        doc.addPage();
        this.renderExecutiveSummary(doc, reportData, primaryColor, secondaryColor);

        // 3. KPI Performance Summary Grid
        this.renderKpiGrid(doc, reportData, primaryColor);

        // 4. Detailed Data Sections
        if (reportData.metrics.gsc.queries.length > 0) {
          doc.addPage();
          this.renderGscQueriesTable(doc, reportData.metrics.gsc.queries, primaryColor);
        }

        if (reportData.metrics.ga4.landingPages.length > 0) {
          this.renderLandingPagesTable(doc, reportData.metrics.ga4.landingPages, primaryColor);
        }

        if (reportData.metrics.gsc.opportunities.length > 0) {
          doc.addPage();
          this.renderKeywordOpportunities(doc, reportData.metrics.gsc.opportunities, primaryColor);
        }

        if (reportData.metrics.seoFindings.length > 0) {
          this.renderSeoFindings(doc, reportData.metrics.seoFindings, primaryColor);
        }

        if (reportData.metrics.clarity.available && reportData.metrics.clarity.summary) {
          this.renderClaritySection(doc, reportData.metrics.clarity.summary, primaryColor);
        }

        // 5. Data Freshness & Disclaimer
        this.renderDataFreshnessNotice(doc, reportData.dataFreshness);

        // 6. Global Headers, Footers, and Page Numbers
        this.applyPageDecorations(doc, reportData, primaryColor);

        doc.end();

        stream.on('finish', () => {
          const stats = fs.statSync(absolutePath);
          logger.info(`Generated PDF report ${filename} (${stats.size} bytes)`);
          resolve({
            filename,
            absolutePath,
            fileSize: stats.size,
          });
        });

        stream.on('error', (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  renderCoverPage(doc, reportData, primaryColor, secondaryColor) {
    // Agency Header Banner
    doc.rect(0, 0, doc.page.width, 180).fill(secondaryColor);

    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
      .text(reportData.branding.agencyName.toUpperCase(), 40, 50, { characterSpacing: 1.5 });

    doc.fontSize(11).font('Helvetica')
      .fillColor('#94a3b8')
      .text('Performance Intelligence & Search Optimization', 40, 80);

    // Colored Accent Stripe
    doc.rect(0, 175, doc.page.width, 5).fill(primaryColor);

    // Report Title
    doc.fillColor(secondaryColor).fontSize(28).font('Helvetica-Bold')
      .text(this.formatReportTitle(reportData.metadata.reportType), 40, 240);

    doc.fillColor('#64748b').fontSize(13).font('Helvetica')
      .text(`Prepared exclusively for: ${reportData.metadata.clientName}`, 40, 280);

    // Website Domain Card
    doc.roundedRect(40, 330, doc.page.width - 80, 80, 8).fill('#f8fafc').stroke('#e2e8f0');
    doc.fillColor(secondaryColor).fontSize(14).font('Helvetica-Bold')
      .text('Target Website:', 60, 348);
    doc.fillColor(primaryColor).fontSize(16)
      .text(reportData.metadata.domain, 60, 370);

    // Metadata Details
    const metaY = 450;
    doc.fillColor('#475569').fontSize(11).font('Helvetica-Bold').text('Reporting Period:', 40, metaY);
    doc.font('Helvetica').text(`${formatDateHuman(reportData.metadata.periodStart)} – ${formatDateHuman(reportData.metadata.periodEnd)}`, 160, metaY);

    if (reportData.metadata.comparisonStart) {
      doc.font('Helvetica-Bold').text('Comparison Period:', 40, metaY + 25);
      doc.font('Helvetica').text(`${formatDateHuman(reportData.metadata.comparisonStart)} – ${formatDateHuman(reportData.metadata.comparisonEnd)}`, 160, metaY + 25);
    }

    doc.font('Helvetica-Bold').text('Generated Date:', 40, metaY + 50);
    doc.font('Helvetica').text(formatDateHuman(reportData.metadata.generatedAt), 160, metaY + 50);

    doc.font('Helvetica-Bold').text('Data Providers:', 40, metaY + 75);
    const providers = [];
    if (reportData.dataFreshness.GA4.connected) providers.push('Google Analytics 4');
    if (reportData.dataFreshness.GSC.connected) providers.push('Google Search Console');
    if (reportData.dataFreshness.CLARITY.connected) providers.push('Microsoft Clarity');
    doc.font('Helvetica').text(providers.join(', ') || 'No active providers', 160, metaY + 75);

    // Footer note on cover
    doc.fontSize(9).fillColor('#94a3b8')
      .text(reportData.branding.footerText || 'Confidential Performance Audit', 40, doc.page.height - 60, {
        align: 'center',
        width: doc.page.width - 80,
      });
  }

  renderExecutiveSummary(doc, reportData, primaryColor, secondaryColor) {
    this.renderSectionHeader(doc, 'Executive Summary', primaryColor);

    const summaryText = reportData.executiveSummary?.text || 'No summary generated.';
    doc.fontSize(10).font('Helvetica').fillColor('#334155')
      .text(summaryText, {
        align: 'justify',
        lineGap: 4,
      });

    doc.moveDown(1.5);
  }

  renderKpiGrid(doc, reportData, primaryColor) {
    this.renderSectionHeader(doc, 'Key Performance Indicators', primaryColor);

    const kpis = [
      {
        label: 'Organic Sessions',
        value: formatNumber(reportData.metrics.ga4.summary?.sessions || 0),
        change: reportData.metrics.ga4.comparison?.sessionsChangePercent,
      },
      {
        label: 'Active Users',
        value: formatNumber(reportData.metrics.ga4.summary?.totalUsers || 0),
        change: reportData.metrics.ga4.comparison?.usersChangePercent,
      },
      {
        label: 'Organic Clicks',
        value: formatNumber(reportData.metrics.gsc.summary?.clicks || 0),
        change: reportData.metrics.gsc.comparison?.clicksChangePercent,
      },
      {
        label: 'Search Impressions',
        value: formatNumber(reportData.metrics.gsc.summary?.impressions || 0),
        change: reportData.metrics.gsc.comparison?.impressionsChangePercent,
      },
      {
        label: 'Avg. Click-Through Rate',
        value: formatPercentage(reportData.metrics.gsc.summary?.ctr || 0),
        change: null,
      },
      {
        label: 'Avg. Search Position',
        value: formatPosition(reportData.metrics.gsc.summary?.averagePosition || 0),
        change: null,
      },
    ];

    const cardWidth = 160;
    const cardHeight = 65;
    const startX = 40;
    let startY = doc.y + 5;

    kpis.forEach((kpi, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const x = startX + col * (cardWidth + 15);
      const y = startY + row * (cardHeight + 12);

      doc.roundedRect(x, y, cardWidth, cardHeight, 6).fill('#f8fafc').stroke('#e2e8f0');

      doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold')
        .text(kpi.label, x + 10, y + 10);

      doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold')
        .text(kpi.value, x + 10, y + 26);

      if (kpi.change !== null && kpi.change !== undefined) {
        const isPos = kpi.change >= 0;
        const changeStr = `${isPos ? '+' : ''}${kpi.change.toFixed(1)}% vs prior`;
        doc.fillColor(isPos ? '#16a34a' : '#dc2626').fontSize(8).font('Helvetica')
          .text(changeStr, x + 10, y + 48);
      }
    });

    doc.y = startY + (2 * (cardHeight + 12)) + 15;
  }

  renderGscQueriesTable(doc, queries, primaryColor) {
    this.renderSectionHeader(doc, 'Top Performing Search Queries (GSC)', primaryColor);

    const headers = ['Search Query', 'Impressions', 'Clicks', 'CTR', 'Position'];
    const widths = [220, 75, 65, 65, 65];
    const startX = 40;

    let y = doc.y + 5;
    doc.rect(startX, y, doc.page.width - 80, 20).fill('#f1f5f9');
    doc.fillColor('#334155').fontSize(9).font('Helvetica-Bold');

    let x = startX;
    headers.forEach((h, i) => {
      doc.text(h, x + 6, y + 6, { width: widths[i], align: i > 0 ? 'right' : 'left' });
      x += widths[i];
    });

    y += 20;
    doc.font('Helvetica').fontSize(8.5);

    queries.slice(0, 15).forEach((q, idx) => {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 50;
      }

      if (idx % 2 === 1) {
        doc.rect(startX, y, doc.page.width - 80, 18).fill('#f8fafc');
      }

      x = startX;
      doc.fillColor('#0f172a').text(q.query, x + 6, y + 5, { width: widths[0] - 10, lineBreak: false });
      x += widths[0];

      doc.fillColor('#475569').text(formatNumber(q.impressions), x + 6, y + 5, { width: widths[1] - 10, align: 'right' });
      x += widths[1];

      doc.text(formatNumber(q.clicks), x + 6, y + 5, { width: widths[2] - 10, align: 'right' });
      x += widths[2];

      doc.text(formatPercentage(q.ctr), x + 6, y + 5, { width: widths[3] - 10, align: 'right' });
      x += widths[3];

      doc.text(formatPosition(q.position), x + 6, y + 5, { width: widths[4] - 10, align: 'right' });

      y += 18;
    });

    doc.y = y + 15;
  }

  renderLandingPagesTable(doc, pages, primaryColor) {
    if (doc.y > doc.page.height - 180) {
      doc.addPage();
    }

    this.renderSectionHeader(doc, 'Top Organic Landing Pages (GA4)', primaryColor);

    const headers = ['Landing Page Path', 'Sessions', 'Users', 'Bounce Rate'];
    const widths = [270, 75, 75, 70];
    const startX = 40;

    let y = doc.y + 5;
    doc.rect(startX, y, doc.page.width - 80, 20).fill('#f1f5f9');
    doc.fillColor('#334155').fontSize(9).font('Helvetica-Bold');

    let x = startX;
    headers.forEach((h, i) => {
      doc.text(h, x + 6, y + 6, { width: widths[i], align: i > 0 ? 'right' : 'left' });
      x += widths[i];
    });

    y += 20;
    doc.font('Helvetica').fontSize(8.5);

    pages.slice(0, 10).forEach((p, idx) => {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 50;
      }

      if (idx % 2 === 1) {
        doc.rect(startX, y, doc.page.width - 80, 18).fill('#f8fafc');
      }

      x = startX;
      doc.fillColor('#0f172a').text(p.pagePath || p.landingPage || '/', x + 6, y + 5, { width: widths[0] - 10, lineBreak: false });
      x += widths[0];

      doc.fillColor('#475569').text(formatNumber(p.sessions), x + 6, y + 5, { width: widths[1] - 10, align: 'right' });
      x += widths[1];

      doc.text(formatNumber(p.users || p.totalUsers || 0), x + 6, y + 5, { width: widths[2] - 10, align: 'right' });
      x += widths[2];

      doc.text(formatPercentage(p.bounceRate || 0), x + 6, y + 5, { width: widths[3] - 10, align: 'right' });

      y += 18;
    });

    doc.y = y + 15;
  }

  renderKeywordOpportunities(doc, opps, primaryColor) {
    this.renderSectionHeader(doc, 'Keyword Striking Distance Opportunities (Positions 4–20)', primaryColor);

    doc.fontSize(8.5).font('Helvetica').fillColor('#64748b')
      .text('Target queries ranking just outside the Top 3 with significant search impression visibility:', { lineGap: 4 });
    doc.moveDown(0.5);

    opps.slice(0, 8).forEach((opp) => {
      const boxHeight = 45;
      if (doc.y > doc.page.height - 70) {
        doc.addPage();
      }

      const y = doc.y;
      doc.roundedRect(40, y, doc.page.width - 80, boxHeight, 4).fill('#f8fafc').stroke('#e2e8f0');

      doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold')
        .text(opp.query, 50, y + 8);

      doc.fillColor('#475569').fontSize(8.5).font('Helvetica')
        .text(`Rank: #${formatPosition(opp.position)}  |  Impressions: ${formatNumber(opp.impressions)}  |  Clicks: ${formatNumber(opp.clicks)}  |  CTR: ${formatPercentage(opp.ctr)}`, 50, y + 25);

      doc.y = y + boxHeight + 8;
    });

    doc.moveDown(1);
  }

  renderSeoFindings(doc, findings, primaryColor) {
    if (doc.y > doc.page.height - 180) {
      doc.addPage();
    }

    this.renderSectionHeader(doc, 'Deterministic SEO Audit Findings', primaryColor);

    findings.slice(0, 6).forEach((f) => {
      const boxHeight = 55;
      if (doc.y > doc.page.height - 80) {
        doc.addPage();
      }

      const y = doc.y;
      const isCritical = f.severity === 'CRITICAL' || f.severity === 'HIGH';
      const borderColor = isCritical ? '#fca5a5' : '#e2e8f0';
      const badgeBg = isCritical ? '#fee2e2' : '#f1f5f9';
      const badgeText = isCritical ? '#b91c1c' : '#475569';

      doc.roundedRect(40, y, doc.page.width - 80, boxHeight, 4).fill('#ffffff').stroke(borderColor);

      // Severity Badge
      doc.roundedRect(50, y + 8, 55, 14, 3).fill(badgeBg);
      doc.fillColor(badgeText).fontSize(7.5).font('Helvetica-Bold')
        .text(f.severity || 'INFO', 50, y + 11, { width: 55, align: 'center' });

      // Title & Description
      doc.fillColor('#0f172a').fontSize(9.5).font('Helvetica-Bold')
        .text(f.title, 115, y + 9, { width: doc.page.width - 170, lineBreak: false });

      doc.fillColor('#64748b').fontSize(8).font('Helvetica')
        .text(f.description || f.recommendation || '', 50, y + 26, {
          width: doc.page.width - 100,
          height: 24,
          ellipsis: true,
        });

      doc.y = y + boxHeight + 8;
    });

    doc.moveDown(1);
  }

  renderClaritySection(doc, clarity, primaryColor) {
    if (doc.y > doc.page.height - 200) {
      doc.addPage();
    }

    this.renderSectionHeader(doc, 'Microsoft Clarity UX Behaviour Insights', primaryColor);

    doc.fillColor('#64748b').fontSize(8.5).font('Helvetica')
      .text('Aggregate visitor friction and interaction metrics identified across recorded user sessions:', { lineGap: 3 });
    doc.moveDown(0.5);

    const totalSessions = clarity.totalSessions ?? clarity.friction?.totalSessions ?? 0;
    const distinctUsers = clarity.distinctUsers ?? clarity.friction?.distinctUsers ?? 0;
    const avgScroll = clarity.avgScrollDepth ?? clarity.friction?.avgScrollDepth ?? 0;
    const deadClicks = clarity.deadClicks ?? clarity.friction?.deadClickCount ?? 0;
    const rageClicks = clarity.rageClicks ?? clarity.friction?.rageClickCount ?? 0;
    const quickbacks = clarity.quickbacks ?? clarity.friction?.quickbackClickCount ?? 0;

    const metrics = [
      { label: 'Recorded Sessions', val: formatNumber(totalSessions) },
      { label: 'Unique Visitors', val: formatNumber(distinctUsers) },
      { label: 'Avg Scroll Depth', val: `${avgScroll}%` },
      { label: 'Quick Backs', val: formatNumber(quickbacks) },
      { label: 'Rage Clicks', val: formatNumber(rageClicks) },
      { label: 'Dead Clicks', val: formatNumber(deadClicks) },
    ];

    let y = doc.y;
    const boxW = 75;
    const gap = 10;
    metrics.forEach((m, i) => {
      const x = 40 + i * (boxW + gap);
      doc.roundedRect(x, y, boxW, 44, 4).fill('#f8fafc').stroke('#e2e8f0');
      doc.fillColor('#64748b').fontSize(7.5).font('Helvetica').text(m.label, x + 6, y + 7, { width: boxW - 12 });
      doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text(m.val, x + 6, y + 23, { width: boxW - 12 });
    });

    y += 56;
    doc.y = y;

    // Render Top Pages from Clarity if available
    const topPages = clarity.topPages || [];
    if (topPages.length > 0) {
      if (doc.y > doc.page.height - 150) {
        doc.addPage();
        y = 50;
      }

      doc.fillColor('#1e293b').fontSize(10).font('Helvetica-Bold')
        .text('Top Visited Pages (Clarity Behavioral Tracking)', 40, y);
      y += 16;

      const headers = ['Page / URL', 'Sessions / Visits'];
      const widths = [380, 110];
      const startX = 40;

      doc.rect(startX, y, doc.page.width - 80, 18).fill('#f1f5f9');
      doc.fillColor('#334155').fontSize(8.5).font('Helvetica-Bold');
      doc.text(headers[0], startX + 6, y + 5, { width: widths[0] });
      doc.text(headers[1], startX + widths[0] + 6, y + 5, { width: widths[1], align: 'right' });
      y += 18;

      doc.font('Helvetica').fontSize(8);
      topPages.slice(0, 8).forEach((p, idx) => {
        if (y > doc.page.height - 50) {
          doc.addPage();
          y = 50;
        }

        if (idx % 2 === 1) {
          doc.rect(startX, y, doc.page.width - 80, 16).fill('#f8fafc');
        }

        doc.fillColor('#0f172a').text(p.page, startX + 6, y + 4, { width: widths[0] - 10, lineBreak: false });
        doc.fillColor('#475569').text(formatNumber(p.sessions), startX + widths[0] + 6, y + 4, { width: widths[1] - 10, align: 'right' });
        y += 16;
      });

      y += 10;
      doc.y = y;
    }
  }

  renderDataFreshnessNotice(doc, freshness) {
    if (doc.y > doc.page.height - 80) {
      doc.addPage();
    }

    const y = doc.y + 10;
    doc.roundedRect(40, y, doc.page.width - 80, 40, 4).fill('#f1f5f9');
    doc.fillColor('#475569').fontSize(7.5).font('Helvetica')
      .text('DATA FRESHNESS & INTEGRITY: All metrics are computed strictly from stored local data snapshots. GA4 Sync: ' +
        (freshness.GA4.connected ? formatDateHuman(freshness.GA4.lastSyncAt) : 'Disconnected') +
        ' | GSC Sync: ' +
        (freshness.GSC.connected ? formatDateHuman(freshness.GSC.lastSyncAt) : 'Disconnected') +
        ' | Clarity Sync: ' +
        (freshness.CLARITY.connected ? formatDateHuman(freshness.CLARITY.lastSyncAt) : 'Disconnected'),
      50, y + 10, { width: doc.page.width - 100, align: 'center', lineGap: 2 });
  }

  renderSectionHeader(doc, title, primaryColor) {
    doc.fillColor(primaryColor).fontSize(14).font('Helvetica-Bold')
      .text(title);
    doc.rect(40, doc.y + 2, doc.page.width - 80, 1.5).fill(primaryColor);
    doc.moveDown(0.8);
  }

  applyPageDecorations(doc, reportData, primaryColor) {
    const range = doc.bufferedPageRange();

    for (let i = 1; i < range.count; i++) {
      doc.switchToPage(i);

      // Running Header
      doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica')
        .text(`${reportData.branding.agencyName} | ${reportData.metadata.websiteName} (${reportData.metadata.domain})`,
          40, 20, { width: doc.page.width - 80, align: 'left' });

      doc.text(this.formatReportTitle(reportData.metadata.reportType),
        40, 20, { width: doc.page.width - 80, align: 'right' });

      doc.rect(40, 32, doc.page.width - 80, 0.5).fill('#e2e8f0');

      // Running Footer
      doc.rect(40, doc.page.height - 35, doc.page.width - 80, 0.5).fill('#e2e8f0');

      doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica')
        .text(reportData.branding.footerText || 'Confidential Performance Audit',
          40, doc.page.height - 25, { width: doc.page.width - 80, align: 'left' });

      doc.text(`Page ${i + 1} of ${range.count}`,
        40, doc.page.height - 25, { width: doc.page.width - 80, align: 'right' });
    }
  }

  formatReportTitle(type) {
    const map = {
      MONTHLY_SEO: 'Monthly SEO Performance Report',
      MONTHLY: 'Monthly SEO Performance Report',
      WEEKLY: 'Weekly SEO Performance Report',
      WEBSITE_PERFORMANCE: 'Website Performance & Traffic Report',
      KEYWORD_OPPORTUNITY: 'Keyword Opportunity & Rankings Report',
      TRAFFIC_DROP: 'Traffic Drop Investigation Report',
      CLARITY_BEHAVIOUR: 'Clarity User Behaviour & UX Report',
      CUSTOM: 'Custom Tailored SEO Report',
    };
    return map[type] || 'SEO Intelligence Performance Report';
  }
}

export const pdfReportGenerator = new PdfReportGenerator();
