// frontend/src/features/reports/reportsApi.js
// RTK Query API slice for SEO reports, templates, preview, schedules, and branding settings.

import { baseApi } from '../api/baseApi.js';

export const reportsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getReportTemplates: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/reports/templates`,
    }),

    getReports: builder.query({
      query: ({ workspaceId, websiteId, clientId, status, limit = 20, offset = 0 }) => ({
        url: `/workspaces/${workspaceId}/reports`,
        params: { websiteId, clientId, status, limit, offset },
      }),
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: 'Reports', id })),
              { type: 'Reports', id: 'LIST' },
            ]
          : [{ type: 'Reports', id: 'LIST' }],
    }),

    getReportById: builder.query({
      query: ({ workspaceId, reportId }) => `/workspaces/${workspaceId}/reports/${reportId}`,
      providesTags: (result, error, { reportId }) => [{ type: 'Reports', id: reportId }],
    }),

    previewReport: builder.mutation({
      query: ({ workspaceId, ...body }) => ({
        url: `/workspaces/${workspaceId}/reports/preview`,
        method: 'POST',
        body,
      }),
    }),

    createReport: builder.mutation({
      query: ({ workspaceId, ...body }) => ({
        url: `/workspaces/${workspaceId}/reports`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Reports', id: 'LIST' }],
    }),

    deleteReport: builder.mutation({
      query: ({ workspaceId, reportId }) => ({
        url: `/workspaces/${workspaceId}/reports/${reportId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { reportId }) => [
        { type: 'Reports', id: reportId },
        { type: 'Reports', id: 'LIST' },
      ],
    }),

    getReportSchedules: builder.query({
      query: ({ workspaceId, websiteId }) => ({
        url: `/workspaces/${workspaceId}/reports/schedules/all`,
        params: { websiteId },
      }),
      providesTags: [{ type: 'ReportSchedules', id: 'LIST' }],
    }),

    createReportSchedule: builder.mutation({
      query: ({ workspaceId, ...body }) => ({
        url: `/workspaces/${workspaceId}/reports/schedules`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'ReportSchedules', id: 'LIST' }],
    }),

    toggleReportSchedule: builder.mutation({
      query: ({ workspaceId, scheduleId, isActive }) => ({
        url: `/workspaces/${workspaceId}/reports/schedules/${scheduleId}/toggle`,
        method: 'PATCH',
        body: { isActive },
      }),
      invalidatesTags: [{ type: 'ReportSchedules', id: 'LIST' }],
    }),

    deleteReportSchedule: builder.mutation({
      query: ({ workspaceId, scheduleId }) => ({
        url: `/workspaces/${workspaceId}/reports/schedules/${scheduleId}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'ReportSchedules', id: 'LIST' }],
    }),

    getReportBranding: builder.query({
      query: (workspaceId) => `/workspaces/${workspaceId}/reports/branding/settings`,
      providesTags: ['ReportBranding'],
    }),

    updateReportBranding: builder.mutation({
      query: ({ workspaceId, ...body }) => ({
        url: `/workspaces/${workspaceId}/reports/branding/settings`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['ReportBranding'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetReportTemplatesQuery,
  useGetReportsQuery,
  useGetReportByIdQuery,
  usePreviewReportMutation,
  useCreateReportMutation,
  useDeleteReportMutation,
  useGetReportSchedulesQuery,
  useCreateReportScheduleMutation,
  useToggleReportScheduleMutation,
  useDeleteReportScheduleMutation,
  useGetReportBrandingQuery,
  useUpdateReportBrandingMutation,
} = reportsApi;
