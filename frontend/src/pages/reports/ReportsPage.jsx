// frontend/src/pages/reports/ReportsPage.jsx
// Complete Reporting and Export System Dashboard: Report Builder, History, Schedules, and Branding.

import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { selectActiveWorkspace } from '../../features/auth/authSlice.js';
import { API_BASE_URL } from '../../features/api/baseApi.js';
import {
  useGetReportTemplatesQuery,
  useGetReportsQuery,
  usePreviewReportMutation,
  useCreateReportMutation,
  useDeleteReportMutation,
  useGetReportSchedulesQuery,
  useCreateReportScheduleMutation,
  useToggleReportScheduleMutation,
  useDeleteReportScheduleMutation,
  useGetReportBrandingQuery,
  useUpdateReportBrandingMutation,
} from '../../features/reports/reportsApi.js';
import { useGetClientsQuery } from '../../features/clients/clientsApi.js';
import { useGetWebsitesQuery } from '../../features/websites/websitesApi.js';
import {
  FileText,
  Download,
  Calendar,
  Clock,
  Settings,
  Sparkles,
  Trash2,
  Play,
  Pause,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  FileSpreadsheet,
  Globe,
  Sliders,
  ChevronRight,
} from 'lucide-react';

export default function ReportsPage() {
  const workspace = useSelector(selectActiveWorkspace);
  const accessToken = useSelector((state) => state.auth?.accessToken);
  const workspaceId = workspace?.id;

  const [activeTab, setActiveTab] = useState('builder'); // 'builder' | 'history' | 'schedules' | 'branding'
  const [downloadingFormat, setDownloadingFormat] = useState(null);

  // Report Builder State
  const [selectedTemplate, setSelectedTemplate] = useState('MONTHLY_SEO');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedWebsite, setSelectedWebsite] = useState('');
  const [periodPreset, setPeriodPreset] = useState('last_30_days');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  });
  const [format, setFormat] = useState('BOTH'); // 'PDF' | 'EXCEL' | 'BOTH'
  const [includeAiSummary, setIncludeAiSummary] = useState(false);
  const [reportTitle, setReportTitle] = useState('');

  // Modals & Preview State
  const [previewData, setPreviewData] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  // Queries
  const { data: templatesData, isLoading: templatesLoading } = useGetReportTemplatesQuery(workspaceId, {
    skip: !workspaceId,
  });

  const { data: reportsData, isLoading: reportsLoading, refetch: refetchReports } = useGetReportsQuery(
    { workspaceId, limit: 30 },
    { skip: !workspaceId, pollingInterval: 15000 }
  );

  const { data: schedulesData, isLoading: schedulesLoading } = useGetReportSchedulesQuery(
    { workspaceId },
    { skip: !workspaceId }
  );

  const { data: brandingData, isLoading: brandingLoading } = useGetReportBrandingQuery(workspaceId, {
    skip: !workspaceId,
  });

  const { data: clientsData } = useGetClientsQuery({ workspaceId }, { skip: !workspaceId });
  const { data: websitesData } = useGetWebsitesQuery({ workspaceId }, { skip: !workspaceId });

  // Mutations
  const [createReport, { isLoading: isGenerating }] = useCreateReportMutation();
  const [previewReport, { isLoading: isPreviewing }] = usePreviewReportMutation();
  const [deleteReport] = useDeleteReportMutation();
  const [createSchedule, { isLoading: isCreatingSchedule }] = useCreateReportScheduleMutation();
  const [toggleSchedule] = useToggleReportScheduleMutation();
  const [deleteSchedule] = useDeleteReportScheduleMutation();
  const [updateBranding, { isLoading: isSavingBranding }] = useUpdateReportBrandingMutation();

  // Branding Form State
  const [brandingForm, setBrandingForm] = useState(null);

  React.useEffect(() => {
    if (brandingData?.data && !brandingForm) {
      setBrandingForm(brandingData.data);
    }
  }, [brandingData, brandingForm]);

  const clients = clientsData?.data || [];
  const websites = (websitesData?.data || []).filter(w => !selectedClient || w.clientId === selectedClient);
  const templates = templatesData?.data || [];
  const reports = reportsData?.data || [];
  const schedules = schedulesData?.data || [];

  // Date Preset Handler
  const handlePresetChange = (preset) => {
    setPeriodPreset(preset);
    const end = new Date();
    end.setDate(end.getDate() - 1);
    const start = new Date(end);

    if (preset === 'last_7_days') {
      start.setDate(end.getDate() - 6);
    } else if (preset === 'last_14_days') {
      start.setDate(end.getDate() - 13);
    } else if (preset === 'last_28_days') {
      start.setDate(end.getDate() - 27);
    } else if (preset === 'last_30_days') {
      start.setDate(end.getDate() - 29);
    }
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  // Preview Handler
  const handlePreview = async () => {
    if (!selectedWebsite) {
      alert('Please select a target website first.');
      return;
    }

    try {
      const res = await previewReport({
        workspaceId,
        websiteId: selectedWebsite,
        reportType: selectedTemplate,
        periodStart: startDate,
        periodEnd: endDate,
      }).unwrap();

      setPreviewData(res.data);
      setIsPreviewOpen(true);
    } catch (err) {
      alert(`Preview failed: ${err?.data?.message || err.message}`);
    }
  };

  // Generate Report Handler
  const handleGenerate = async () => {
    if (!selectedWebsite) {
      alert('Please select a target website.');
      return;
    }

    try {
      await createReport({
        workspaceId,
        websiteId: selectedWebsite,
        reportType: selectedTemplate,
        format,
        title: reportTitle.trim() || undefined,
        periodStart: startDate,
        periodEnd: endDate,
        includeAiSummary,
      }).unwrap();

      alert('Report generation queued successfully! You can track progress in Report History.');
      setActiveTab('history');
      refetchReports();
    } catch (err) {
      alert(`Report creation failed: ${err?.data?.message || err.message}`);
    }
  };

  // Download Handler (Authenticated token stream with direct Blob download)
  const handleDownload = async (reportId, fileFormat) => {
    const key = `${reportId}-${fileFormat}`;
    setDownloadingFormat(key);
    try {
      const url = `${API_BASE_URL}/workspaces/${workspaceId}/reports/${reportId}/download?format=${fileFormat}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: 'include',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Download failed with HTTP ${res.status}`);
      }

      // Read Content-Disposition filename if present
      const disposition = res.headers.get('Content-Disposition');
      let filename = `seo-report-${reportId.slice(0, 8)}.${fileFormat.toLowerCase() === 'excel' || fileFormat.toLowerCase() === 'xlsx' ? 'xlsx' : 'pdf'}`;
      if (disposition && disposition.includes('filename=')) {
        const matches = disposition.match(/filename="?([^";]+)"?/);
        if (matches && matches[1]) {
          filename = matches[1];
        }
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  // KPI Metrics Calculation
  const totalReportsCount = reports.length;
  const completedReportsCount = reports.filter(r => r.status === 'COMPLETED').length;
  const activeSchedulesCount = schedules.filter(s => s.isActive).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-brand-600" />
            SEO Reports & Export System
          </h1>
          <p className="text-sm text-surface-500 mt-1">
            Generate, schedule, and download agency-branded PDF audits and Excel performance intelligence.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('builder')}
            className="btn btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            New Report
          </button>
        </div>
      </div>

      {/* KPI Stats Overview Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Total Reports</p>
            <p className="text-2xl font-bold text-surface-900 mt-1">{totalReportsCount}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-surface-100 flex items-center justify-center text-surface-600">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Completed Exports</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{completedReportsCount}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Active Schedules</p>
            <p className="text-2xl font-bold text-brand-600 mt-1">{activeSchedulesCount}</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Export Engines</p>
            <p className="text-2xl font-bold text-surface-900 mt-1">PDF + XLSX</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-surface-100 flex items-center justify-center text-surface-600">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-surface-200">
        <nav className="flex space-x-4 sm:space-x-8 overflow-x-auto scrollbar-none whitespace-nowrap pb-px">
          {[
            { id: 'builder', label: 'Report Builder', icon: Sliders },
            { id: 'history', label: `Report History (${totalReportsCount})`, icon: Clock },
            { id: 'schedules', label: `Recurring Schedules (${schedules.length})`, icon: Calendar },
            { id: 'branding', label: 'Agency Branding', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors flex-shrink-0 ${
                  isActive
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: REPORT BUILDER */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'builder' && (
        <div className="space-y-6">
          {/* Step 1: Template Selection */}
          <div className="card p-6 space-y-4">
            <h2 className="text-base font-semibold text-surface-900">1. Select Report Template</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedTemplate(tpl.id)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedTemplate === tpl.id
                      ? 'border-brand-600 bg-brand-50/30 ring-2 ring-brand-100'
                      : 'border-surface-200 hover:border-surface-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm text-surface-900">{tpl.name}</span>
                    <span className="text-2xs font-medium px-2 py-0.5 rounded bg-surface-100 text-surface-600">
                      {tpl.recommendedFrequency}
                    </span>
                  </div>
                  <p className="text-xs text-surface-500 line-clamp-2 leading-relaxed">{tpl.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Step 2: Target Website & Clients */}
          <div className="card p-6 space-y-4">
            <h2 className="text-base font-semibold text-surface-900">2. Target Website & Scope</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Client Organization</label>
                <select
                  value={selectedClient}
                  onChange={(e) => {
                    setSelectedClient(e.target.value);
                    setSelectedWebsite('');
                  }}
                  className="input w-full"
                >
                  <option value="">All Client Accounts</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">
                  Target Website <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedWebsite}
                  onChange={(e) => setSelectedWebsite(e.target.value)}
                  className="input w-full"
                  required
                >
                  <option value="">Select a website to report on...</option>
                  {websites.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.domain})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Step 3: Date Range & Export Formats */}
          <div className="card p-6 space-y-4">
            <h2 className="text-base font-semibold text-surface-900">3. Reporting Period & Options</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Date Range Preset</label>
                <select
                  value={periodPreset}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  className="input w-full"
                >
                  <option value="last_7_days">Last 7 Days</option>
                  <option value="last_14_days">Last 14 Days</option>
                  <option value="last_28_days">Last 28 Days (Standard)</option>
                  <option value="last_30_days">Last 30 Days</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPeriodPreset('custom');
                  }}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPeriodPreset('custom');
                  }}
                  className="input w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Output Format</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'PDF', label: 'PDF Audit', icon: FileText },
                    { id: 'EXCEL', label: 'Excel (XLSX)', icon: FileSpreadsheet },
                    { id: 'BOTH', label: 'Both (PDF + XLSX)', icon: Download },
                  ].map((fmt) => {
                    const Icon = fmt.icon;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setFormat(fmt.id)}
                        className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                          format === fmt.id
                            ? 'border-brand-600 bg-brand-50 text-brand-700 font-semibold'
                            : 'border-surface-200 text-surface-600 hover:bg-surface-50'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {fmt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-surface-700 mb-1.5">Custom Report Title (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Q4 Executive SEO Performance Review"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className="input w-full"
                />
              </div>
            </div>

            {/* AI Executive Summary Option */}
            <div className="pt-2 border-t border-surface-100 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-brand-600" />
                  <span className="text-sm font-semibold text-surface-900">AI-Generated Executive Summary</span>
                  <span className="text-2xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded font-medium">Local Ollama Qwen</span>
                </div>
                <p className="text-xs text-surface-500 mt-0.5">
                  Synthesizes 3-paragraph executive narrative from verified data snapshots without external AI calls.
                </p>
              </div>
              <input
                type="checkbox"
                checked={includeAiSummary}
                onChange={(e) => setIncludeAiSummary(e.target.checked)}
                className="w-4 h-4 text-brand-600 rounded border-surface-300 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={handlePreview}
              disabled={isPreviewing || !selectedWebsite}
              className="btn btn-secondary flex items-center gap-2 text-sm"
            >
              {isPreviewing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              Preview Data
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !selectedWebsite}
              className="btn btn-primary flex items-center gap-2 text-sm px-6"
            >
              {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Generate Report
            </button>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: REPORT HISTORY */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-surface-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-surface-900">Generated Reports Archive</h2>
            <button
              onClick={() => refetchReports()}
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          {reportsLoading ? (
            <div className="p-12 text-center text-sm text-surface-400">Loading reports history…</div>
          ) : reports.length === 0 ? (
            <div className="p-12 text-center text-sm text-surface-400">
              No reports generated yet. Use the Report Builder to create your first report.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-50 text-surface-600 font-semibold border-b border-surface-100 uppercase tracking-wider text-2xs">
                  <tr>
                    <th className="py-3 px-4">Report Title</th>
                    <th className="py-3 px-4">Client / Website</th>
                    <th className="py-3 px-4">Period</th>
                    <th className="py-3 px-4">Format</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Generated Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {reports.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-50/60 transition-colors">
                      <td className="py-3 px-4 font-semibold text-surface-900">{r.title}</td>
                      <td className="py-3 px-4 text-surface-600">
                        <div>{r.client?.name || 'Client'}</div>
                        <div className="text-2xs text-surface-400">{r.website?.domain}</div>
                      </td>
                      <td className="py-3 px-4 text-surface-500">
                        {r.periodStart} → {r.periodEnd}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-2xs px-2 py-0.5 rounded bg-surface-100 text-surface-700">
                          {r.format}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold ${
                            r.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-700'
                              : r.status === 'GENERATING'
                              ? 'bg-amber-50 text-amber-700 animate-pulse'
                              : r.status === 'FAILED'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-surface-100 text-surface-600'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-surface-400">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {r.status === 'COMPLETED' && (
                          <>
                            {(r.format === 'PDF' || r.format === 'BOTH') && (
                              <button
                                onClick={() => handleDownload(r.id, 'PDF')}
                                disabled={downloadingFormat === `${r.id}-PDF`}
                                className="btn btn-secondary btn-sm text-2xs py-1 px-2.5 inline-flex items-center gap-1 disabled:opacity-50"
                                title="Download PDF"
                              >
                                {downloadingFormat === `${r.id}-PDF` ? (
                                  <RefreshCw className="w-3 h-3 text-brand-600 animate-spin" />
                                ) : (
                                  <Download className="w-3 h-3 text-brand-600" />
                                )}
                                PDF
                              </button>
                            )}
                            {(r.format === 'EXCEL' || r.format === 'BOTH') && (
                              <button
                                onClick={() => handleDownload(r.id, 'EXCEL')}
                                disabled={downloadingFormat === `${r.id}-EXCEL`}
                                className="btn btn-secondary btn-sm text-2xs py-1 px-2.5 inline-flex items-center gap-1 disabled:opacity-50"
                                title="Download Excel XLSX"
                              >
                                {downloadingFormat === `${r.id}-EXCEL` ? (
                                  <RefreshCw className="w-3 h-3 text-emerald-600 animate-spin" />
                                ) : (
                                  <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                                )}
                                XLSX
                              </button>
                            )}
                          </>
                        )}
                        <button
                          onClick={() => {
                            if (confirm('Delete this report and storage files permanently?')) {
                              deleteReport({ workspaceId, reportId: r.id });
                            }
                          }}
                          className="p-1 hover:text-rose-600 text-surface-400 rounded transition-colors inline-block align-middle"
                          title="Delete Report"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* TAB 3: RECURRING SCHEDULES */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'schedules' && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-surface-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-surface-900">Automated Recurring Schedules</h2>
              <p className="text-xs text-surface-500 mt-0.5">
                Powered by BullMQ & Redis queues with automatic retry handling.
              </p>
            </div>
            <button
              onClick={() => setIsScheduleModalOpen(true)}
              className="btn btn-primary btn-sm flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              New Schedule
            </button>
          </div>

          {schedulesLoading ? (
            <div className="p-12 text-center text-sm text-surface-400">Loading schedules…</div>
          ) : schedules.length === 0 ? (
            <div className="p-12 text-center text-sm text-surface-400">
              No recurring report schedules configured. Click "New Schedule" to set up weekly or monthly automation.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-50 text-surface-600 font-semibold border-b border-surface-100 uppercase tracking-wider text-2xs">
                  <tr>
                    <th className="py-3 px-4">Schedule Name</th>
                    <th className="py-3 px-4">Website</th>
                    <th className="py-3 px-4">Frequency</th>
                    <th className="py-3 px-4">Format</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Last Run</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {schedules.map((s) => (
                    <tr key={s.id} className="hover:bg-surface-50/60 transition-colors">
                      <td className="py-3 px-4 font-semibold text-surface-900">{s.reportName}</td>
                      <td className="py-3 px-4 text-surface-600">{s.website?.domain}</td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-surface-700">{s.frequency}</span>
                        <span className="block text-2xs text-surface-400">at {s.scheduledTime || '09:00'}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-2xs text-surface-500">{s.format}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold ${
                            s.isActive
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-surface-100 text-surface-500'
                          }`}
                        >
                          {s.isActive ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-surface-400">
                        {s.lastRunAt ? new Date(s.lastRunAt).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() =>
                            toggleSchedule({
                              workspaceId,
                              scheduleId: s.id,
                              isActive: !s.isActive,
                            })
                          }
                          className="btn btn-secondary btn-sm text-2xs py-1 px-2 inline-flex items-center gap-1"
                        >
                          {s.isActive ? (
                            <>
                              <Pause className="w-3 h-3 text-amber-600" /> Pause
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 text-emerald-600" /> Resume
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this automated schedule permanently?')) {
                              deleteSchedule({ workspaceId, scheduleId: s.id });
                            }
                          }}
                          className="p-1 hover:text-rose-600 text-surface-400 rounded transition-colors inline-block align-middle"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* TAB 4: AGENCY BRANDING */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'branding' && (
        <div className="card p-6 space-y-6 max-w-3xl">
          <div>
            <h2 className="text-base font-semibold text-surface-900">Agency White-Label Branding</h2>
            <p className="text-xs text-surface-500 mt-1">
              Configure agency brand styling and contact information stamped across all client reports.
            </p>
          </div>

          {brandingLoading || !brandingForm ? (
            <div className="text-sm text-surface-400">Loading branding configuration…</div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await updateBranding({ workspaceId, ...brandingForm }).unwrap();
                  alert('Agency branding settings updated successfully!');
                } catch (err) {
                  alert(`Failed updating branding: ${err?.data?.message || err.message}`);
                }
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-semibold text-surface-700 mb-1">Agency Name</label>
                <input
                  type="text"
                  value={brandingForm.agencyName || ''}
                  onChange={(e) => setBrandingForm({ ...brandingForm, agencyName: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-surface-700 mb-1">Brand Primary Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandingForm.brandPrimaryColor || '#4f46e5'}
                      onChange={(e) =>
                        setBrandingForm({ ...brandingForm, brandPrimaryColor: e.target.value })
                      }
                      className="w-8 h-8 rounded border p-0 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={brandingForm.brandPrimaryColor || '#4f46e5'}
                      onChange={(e) =>
                        setBrandingForm({ ...brandingForm, brandPrimaryColor: e.target.value })
                      }
                      className="input flex-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-surface-700 mb-1">Brand Secondary Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={brandingForm.brandSecondaryColor || '#0f172a'}
                      onChange={(e) =>
                        setBrandingForm({ ...brandingForm, brandSecondaryColor: e.target.value })
                      }
                      className="w-8 h-8 rounded border p-0 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={brandingForm.brandSecondaryColor || '#0f172a'}
                      onChange={(e) =>
                        setBrandingForm({ ...brandingForm, brandSecondaryColor: e.target.value })
                      }
                      className="input flex-1"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-surface-700 mb-1">Agency Website</label>
                  <input
                    type="url"
                    value={brandingForm.website || ''}
                    onChange={(e) => setBrandingForm({ ...brandingForm, website: e.target.value })}
                    className="input w-full"
                    placeholder="https://agency.com"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-surface-700 mb-1">Report Contact Email</label>
                  <input
                    type="email"
                    value={brandingForm.contactEmail || ''}
                    onChange={(e) => setBrandingForm({ ...brandingForm, contactEmail: e.target.value })}
                    className="input w-full"
                    placeholder="reports@agency.com"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-surface-700 mb-1">Report Running Footer Text</label>
                <input
                  type="text"
                  value={brandingForm.footerText || ''}
                  onChange={(e) => setBrandingForm({ ...brandingForm, footerText: e.target.value })}
                  className="input w-full"
                  placeholder="Confidential SEO Intelligence · Prepared for Client"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSavingBranding}
                  className="btn btn-primary text-sm px-5"
                >
                  {isSavingBranding ? 'Saving Settings…' : 'Save Branding'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: LIVE PREVIEW DRAWER */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {isPreviewOpen && previewData && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h3 className="text-lg font-bold text-surface-900">Report Data Live Preview</h3>
                <p className="text-xs text-surface-500">
                  {previewData.metadata.websiteName} ({previewData.metadata.domain})
                </p>
              </div>
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="text-surface-400 hover:text-surface-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* Quick KPIs */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="card p-3 bg-surface-50">
                <span className="text-surface-400 font-medium">GA4 Sessions</span>
                <p className="text-lg font-bold text-surface-900 mt-0.5">
                  {(previewData.metrics.ga4.summary?.sessions || 0).toLocaleString()}
                </p>
              </div>
              <div className="card p-3 bg-surface-50">
                <span className="text-surface-400 font-medium">GSC Organic Clicks</span>
                <p className="text-lg font-bold text-surface-900 mt-0.5">
                  {(previewData.metrics.gsc.summary?.clicks || 0).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Executive Summary */}
            <div className="card p-4 space-y-2">
              <h4 className="text-xs font-bold text-surface-900 uppercase tracking-wider">
                Executive Summary Preview
              </h4>
              <p className="text-xs text-surface-600 whitespace-pre-line leading-relaxed">
                {previewData.executiveSummary?.text}
              </p>
            </div>

            {/* Data Freshness Badges */}
            <div className="card p-4 space-y-2 text-xs">
              <h4 className="font-bold text-surface-900 uppercase tracking-wider text-2xs">
                Data Providers Health
              </h4>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span>Google Analytics 4:</span>
                  <span className={previewData.dataFreshness.GA4.connected ? 'text-emerald-600 font-medium' : 'text-surface-400'}>
                    {previewData.dataFreshness.GA4.connected ? 'Connected' : 'Missing'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Google Search Console:</span>
                  <span className={previewData.dataFreshness.GSC.connected ? 'text-emerald-600 font-medium' : 'text-surface-400'}>
                    {previewData.dataFreshness.GSC.connected ? 'Connected' : 'Missing'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Microsoft Clarity:</span>
                  <span className={previewData.dataFreshness.CLARITY.connected ? 'text-emerald-600 font-medium' : 'text-surface-400'}>
                    {previewData.dataFreshness.CLARITY.connected ? 'Connected' : 'Missing'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="btn btn-secondary btn-sm"
              >
                Close Preview
              </button>
              <button
                onClick={() => {
                  setIsPreviewOpen(false);
                  handleGenerate();
                }}
                className="btn btn-primary btn-sm"
              >
                Proceed to Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: CREATE RECURRING SCHEDULE */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-surface-900">Create Automated Report Schedule</h3>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="text-surface-400 hover:text-surface-600"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                try {
                  await createSchedule({
                    workspaceId,
                    websiteId: formData.get('websiteId'),
                    reportName: formData.get('reportName'),
                    reportType: formData.get('reportType'),
                    frequency: formData.get('frequency'),
                    format: formData.get('format'),
                    scheduledTime: formData.get('scheduledTime'),
                  }).unwrap();

                  setIsScheduleModalOpen(false);
                  alert('Schedule created successfully in BullMQ queue!');
                } catch (err) {
                  alert(`Failed creating schedule: ${err?.data?.message || err.message}`);
                }
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-semibold text-surface-700 mb-1">Schedule Name</label>
                <input
                  type="text"
                  name="reportName"
                  required
                  placeholder="e.g. Monthly Executive Client Review"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block font-semibold text-surface-700 mb-1">Target Website</label>
                <select name="websiteId" required className="input w-full">
                  <option value="">Select website...</option>
                  {websites.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.domain})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-surface-700 mb-1">Report Template</label>
                  <select name="reportType" className="input w-full">
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-surface-700 mb-1">Frequency</label>
                  <select name="frequency" className="input w-full">
                    <option value="WEEKLY">Weekly (Mondays)</option>
                    <option value="MONTHLY">Monthly (1st of month)</option>
                    <option value="QUARTERLY">Quarterly</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-surface-700 mb-1">Output Format</label>
                  <select name="format" className="input w-full">
                    <option value="PDF">PDF Audit Document</option>
                    <option value="EXCEL">Excel Spreadsheet</option>
                    <option value="BOTH">Both (PDF + XLSX)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-surface-700 mb-1">Execution Time</label>
                  <input
                    type="time"
                    name="scheduledTime"
                    defaultValue="09:00"
                    className="input w-full"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingSchedule}
                  className="btn btn-primary btn-sm px-4"
                >
                  {isCreatingSchedule ? 'Registering…' : 'Save Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
