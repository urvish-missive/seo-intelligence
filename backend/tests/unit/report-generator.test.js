// backend/tests/unit/report-generator.test.js
// Unit tests for PDF report generation, Excel export, Formula Injection defense, and Storage Service.

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { sanitizeCellValue, sanitizeRecord } from '../../src/modules/reports/utils/formula-sanitizer.js';
import { calculateComparisonPeriod } from '../../src/modules/reports/utils/date-range.utils.js';
import { pdfReportGenerator } from '../../src/modules/reports/generators/pdf-report.generator.js';
import { excelReportGenerator } from '../../src/modules/reports/generators/excel-report.generator.js';
import { reportStorageService } from '../../src/modules/reports/services/report-storage.service.js';

describe('Report Generation & Security Unit Tests', () => {
  const testPdfFilename = 'test-audit.pdf';
  const testExcelFilename = 'test-export.xlsx';

  const mockReportData = {
    metadata: {
      websiteId: '00000000-0000-0000-0000-000000000001',
      websiteName: 'Acme E-Commerce',
      domain: 'acme.com',
      clientName: 'Acme Global Inc',
      workspaceId: 'ws-test-1',
      reportType: 'MONTHLY_SEO',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      comparisonStart: '2026-08-31',
      comparisonEnd: '2026-09-30',
      generatedAt: '2026-11-20T10:00:00Z',
      timezone: 'UTC',
    },
    branding: {
      agencyName: 'Missive SEO Agency',
      brandPrimaryColor: '#4f46e5',
      brandSecondaryColor: '#0f172a',
      website: 'https://missive.digital',
      contactEmail: 'reports@missive.digital',
      footerText: 'Confidential Client Audit',
    },
    dataFreshness: {
      GA4: { connected: true, lastSyncAt: '2026-11-20T00:00:00Z' },
      GSC: { connected: true, lastSyncAt: '2026-11-20T00:00:00Z' },
      CLARITY: { connected: true, lastSyncAt: '2026-11-20T00:00:00Z' },
    },
    executiveSummary: {
      text: 'Acme E-Commerce demonstrated strong performance during October 2026, driven by top queries.',
      source: 'DETERMINISTIC_RULES',
    },
    metrics: {
      ga4: {
        available: true,
        summary: { sessions: 12500, totalUsers: 9800 },
        comparison: { sessionsChangePercent: 14.5, usersChangePercent: 12.0 },
        sources: [
          { source: 'google', medium: 'organic', defaultChannelGroup: 'Organic Search', sessions: 8500, totalUsers: 7200, engagementRate: 64.2, bounceRate: 35.8 },
          { source: '(direct)', medium: '(none)', defaultChannelGroup: 'Direct', sessions: 4000, totalUsers: 2600, engagementRate: 58.0, bounceRate: 42.0 },
        ],
        landingPages: [
          { pagePath: '/', sessions: 5200, users: 4300, bounceRate: 34.2 },
          { pagePath: '/products/shoes', sessions: 2800, users: 2100, bounceRate: 38.5 },
        ],
      },
      gsc: {
        available: true,
        summary: { clicks: 8200, impressions: 145000, ctr: 5.65, averagePosition: 6.8 },
        comparison: { clicksChangePercent: 8.2, impressionsChangePercent: 15.4 },
        queries: [
          { query: 'buy red shoes', clicks: 1200, impressions: 15000, ctr: 8.0, position: 2.4 },
          { query: '=cmd|/c calc!A0', clicks: 350, impressions: 8400, ctr: 4.16, position: 5.2 }, // Malicious injection query
          { query: '@SUM(A1:A10)', clicks: 120, impressions: 4200, ctr: 2.85, position: 12.1 }, // Malicious formula query
        ],
        pages: [
          { page: '/products/shoes', clicks: 3500, impressions: 65000, ctr: 5.38, position: 4.2 },
        ],
        opportunities: [
          { query: 'best trail running shoes', impressions: 24000, clicks: 820, ctr: 3.4, position: 5.8, opportunityType: 'Striking Distance (Pos 4-20)', recommendation: 'Optimize meta title' },
        ],
      },
      clarity: {
        available: true,
        summary: { deadClicks: 145, rageClicks: 32, quickbacks: 88, scriptErrors: 4 },
      },
      seoFindings: [
        { severity: 'HIGH', status: 'OPEN', title: 'Missing Meta Descriptions', affectedTarget: '/products/*', type: 'CONTENT', description: 'Add unique descriptions' },
      ],
    },
  };

  afterEach(() => {
    // Cleanup generated files
    reportStorageService.deleteFile(testPdfFilename);
    reportStorageService.deleteFile(testExcelFilename);
  });

  describe('Formula Injection Defense (CWE-1236)', () => {
    it('should prefix values starting with dangerous formula characters with a single quote', () => {
      expect(sanitizeCellValue('=1+1')).toBe("'=1+1");
      expect(sanitizeCellValue('+cmd|/c calc')).toBe("'+cmd|/c calc");
      expect(sanitizeCellValue('-5+2')).toBe("'-5+2");
      expect(sanitizeCellValue('@SUM(A1:B10)')).toBe("'@SUM(A1:B10)");
      expect(sanitizeCellValue('\tTAB_PREFIX')).toBe("'\tTAB_PREFIX");
      expect(sanitizeCellValue('\rCR_PREFIX')).toBe("'\rCR_PREFIX");
    });

    it('should preserve safe strings, numbers, booleans, and nulls without modification', () => {
      expect(sanitizeCellValue('SEO Agency Report')).toBe('SEO Agency Report');
      expect(sanitizeCellValue('https://example.com/shoes')).toBe('https://example.com/shoes');
      expect(sanitizeCellValue(42)).toBe(42);
      expect(sanitizeCellValue(0)).toBe(0);
      expect(sanitizeCellValue(true)).toBe(true);
      expect(sanitizeCellValue(false)).toBe(false);
      expect(sanitizeCellValue(null)).toBe('');
      expect(sanitizeCellValue(undefined)).toBe('');
    });

    it('should recursively sanitize objects and arrays', () => {
      const dirtyObj = {
        title: '=HYPERLINK("http://evil.com")',
        metrics: {
          query: '@SUM(1,2)',
          safe: 'normal text',
        },
        items: ['+malicious', 'safe'],
      };

      const clean = sanitizeRecord(dirtyObj);
      expect(clean.title).toBe('\'=HYPERLINK("http://evil.com")');
      expect(clean.metrics.query).toBe("'@SUM(1,2)");
      expect(clean.metrics.safe).toBe('normal text');
      expect(clean.items[0]).toBe("'+malicious");
      expect(clean.items[1]).toBe('safe');
    });
  });

  describe('Comparison Period Calculations', () => {
    it('should accurately calculate equivalent prior comparison period', () => {
      // 31 days in October: 2026-10-01 to 2026-10-31
      const res = calculateComparisonPeriod('2026-10-01', '2026-10-31');
      expect(res.durationDays).toBe(31);
      expect(res.comparisonEnd).toBe('2026-09-30');
      expect(res.comparisonStart).toBe('2026-08-31');
    });

    it('should accurately calculate 7 days prior equivalent period', () => {
      const res = calculateComparisonPeriod('2026-10-08', '2026-10-14');
      expect(res.durationDays).toBe(7);
      expect(res.comparisonEnd).toBe('2026-10-07');
      expect(res.comparisonStart).toBe('2026-10-01');
    });
  });

  describe('ReportStorageService Path Traversal Security', () => {
    it('should resolve safe filenames within configured storage directory', () => {
      const { absolutePath } = reportStorageService.resolveFilePath('report-123.pdf');
      expect(absolutePath).toContain('report-123.pdf');
      expect(path.isAbsolute(absolutePath)).toBe(true);
    });

    it('should strip path traversal sequences using path.basename', () => {
      const { filename } = reportStorageService.resolveFilePath('../../etc/passwd');
      expect(filename).toBe('passwd');
    });
  });

  describe('PDF Report Generator', () => {
    it('should render a complete, valid PDF report with cover page and data sections', async () => {
      const result = await pdfReportGenerator.generate(mockReportData, testPdfFilename);

      expect(result.filename).toBe(testPdfFilename);
      expect(result.fileSize).toBeGreaterThan(1000);
      expect(fs.existsSync(result.absolutePath)).toBe(true);

      // Verify PDF header magic bytes "%PDF-"
      const buffer = fs.readFileSync(result.absolutePath);
      expect(buffer.toString('utf-8', 0, 5)).toBe('%PDF-');
    });
  });

  describe('Excel Report Generator', () => {
    it('should generate a multi-sheet workbook with styled headers and formula sanitization', async () => {
      const result = await excelReportGenerator.generate(mockReportData, testExcelFilename);

      expect(result.filename).toBe(testExcelFilename);
      expect(result.fileSize).toBeGreaterThan(1000);
      expect(fs.existsSync(result.absolutePath)).toBe(true);

      // Read back workbook to verify structure and formula protection
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(result.absolutePath);

      const sheetNames = workbook.worksheets.map(s => s.name);
      expect(sheetNames).toContain('Overview');
      expect(sheetNames).toContain('GA4 Traffic');
      expect(sheetNames).toContain('GSC Queries');
      expect(sheetNames).toContain('Keyword Opportunities');
      expect(sheetNames).toContain('Landing Pages');
      expect(sheetNames).toContain('SEO Findings');
      expect(sheetNames).toContain('Clarity UX');

      // Verify that malicious query '=cmd|/c calc!A0' was sanitized with leading quote
      const gscSheet = workbook.getWorksheet('GSC Queries');
      let foundSanitized = false;
      gscSheet.eachRow((row) => {
        const val = row.getCell(1).value;
        if (typeof val === 'string' && val.includes('cmd|/c calc')) {
          expect(val.startsWith("'=")).toBe(true);
          foundSanitized = true;
        }
      });
      expect(foundSanitized).toBe(true);
    });
  });
});
