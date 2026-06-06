import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, ProtectedRoute } from './hooks/useAuth'
import { LoginPage, RegisterPage } from './pages/auth/AuthPages'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { WorkspacePage } from './pages/workspace/WorkspacePage'
import { BoardPage } from './pages/board/BoardPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { JoinWorkspacePage, AcceptInvitePage } from './pages/invite/JoinWorkspacePage'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/join/:token" element={<JoinWorkspacePage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />

        {/* Protected */}
        <Route path="/workspace" element={<ProtectedRoute><WorkspacePage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/projects/:projectId/board" element={<ProtectedRoute><BoardPage /></ProtectedRoute>} />
        <Route path="/settings/*" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

        {/* Redirects */}
        <Route path="/" element={<Navigate to="/workspace" replace />} />
        <Route path="*" element={<Navigate to="/workspace" replace />} />
      </Routes>
    </AuthProvider>
  )
}
