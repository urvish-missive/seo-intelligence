// frontend/src/router/AppRouter.jsx
// Complete application router with authenticated layouts and guards.

import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { selectIsAuthenticated } from '../features/auth/authSlice.js';
import LoadingScreen from '../components/common/LoadingScreen.jsx';
import AppLayout from '../components/layout/AppLayout.jsx';

// Lazy-loaded pages
const LoginPage = lazy(() => import('../pages/auth/LoginPage.jsx'));
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage.jsx'));
const AcceptInvitationPage = lazy(() => import('../pages/auth/AcceptInvitationPage.jsx'));
const DashboardPage = lazy(() => import('../pages/dashboard/DashboardPage.jsx'));
const ClientsPage = lazy(() => import('../pages/clients/ClientsPage.jsx'));
const ClientDetailPage = lazy(() => import('../pages/clients/ClientDetailPage.jsx'));
const WebsitesPage = lazy(() => import('../pages/websites/WebsitesPage.jsx'));
const WebsiteDetailPage = lazy(() => import('../pages/websites/WebsiteDetailPage.jsx'));
const MembersPage = lazy(() => import('../pages/members/MembersPage.jsx'));
const RolesPage = lazy(() => import('../pages/settings/RolesPage.jsx'));
const IntegrationsPage = lazy(() => import('../pages/integrations/IntegrationsPage.jsx'));
const AIAssistantPage = lazy(() => import('../pages/ai/AIAssistantPage.jsx'));
const MCPManagementPage = lazy(() => import('../pages/settings/MCPManagementPage.jsx'));
const ReportsPage = lazy(() => import('../pages/reports/ReportsPage.jsx'));
const ChartsPage = lazy(() => import('../pages/charts/ChartsPage.jsx'));
const InsightsPage = lazy(() => import('../pages/insights/InsightsPage.jsx'));

function ProtectedRoute({ children }) {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function AppRouter() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* Public Authentication Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/accept-invitation" element={<AcceptInvitationPage />} />

        {/* Protected Agency Application Routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:clientId" element={<ClientDetailPage />} />
          <Route path="websites" element={<WebsitesPage />} />
          <Route path="websites/:websiteId" element={<WebsiteDetailPage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="settings/roles" element={<RolesPage />} />
          <Route path="settings/integrations" element={<IntegrationsPage />} />
          <Route path="settings/mcp" element={<MCPManagementPage />} />
          <Route path="integrations" element={<Navigate to="/settings/integrations" replace />} />
          <Route path="ai-assistant" element={<AIAssistantPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="charts" element={<ChartsPage />} />
          <Route path="insights" element={<InsightsPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
