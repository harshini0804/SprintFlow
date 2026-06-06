import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { workspaceApi } from '../../api/client'

export function JoinWorkspacePage() {
  const { token } = useParams<{ token: string }>()
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState('Processing your invitation...')

  useEffect(() => {
    if (isLoading) return
    if (isAuthenticated && token) {
      acceptInvite()
    }
  }, [isAuthenticated, isLoading, token])

  const acceptInvite = async () => {
    try {
      await workspaceApi.acceptInvite(token!)
      setStatus('Successfully joined! Redirecting to dashboard...')
      setTimeout(() => navigate('/workspace'), 2000)
    } catch (err: any) {
      setStatus(err.response?.data?.detail || 'Failed to join workspace. The link may have expired.')
    }
  }

  // Not logged in — store token and prompt login/register
  if (!isLoading && !isAuthenticated) {
    if (token) localStorage.setItem('pendingInvite', token)
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-md border border-slate-200">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 mx-auto text-2xl">
            ✉️
          </div>
          <h2 className="mb-3 text-2xl font-bold text-slate-900">You've been invited!</h2>
          <p className="mb-8 text-sm text-slate-600">
            Please log in or create an account to join this workspace.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              to="/login"
              className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            >
              Log In
            </Link>
            <Link
              to="/register"
              className="rounded-md bg-green-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-green-700"
            >
              Register
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-md border border-slate-200">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 mx-auto animate-pulse text-2xl">
          ⏳
        </div>
        <h2 className="text-lg font-semibold text-slate-900">{status}</h2>
      </div>
    </div>
  )
}

// Also handle the /accept-invite?token= query-param format
export function AcceptInvitePage() {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')

  useEffect(() => {
    if (isLoading) return
    if (!token) { navigate('/workspace'); return }
    if (!isAuthenticated) {
      localStorage.setItem('pendingInvite', token)
      navigate('/login')
      return
    }
    workspaceApi.acceptInvite(token)
      .then(() => navigate('/workspace'))
      .catch(() => navigate('/workspace'))
  }, [isAuthenticated, isLoading, token])

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="animate-pulse text-sm text-slate-500">Accepting invite...</div>
    </div>
  )
}
