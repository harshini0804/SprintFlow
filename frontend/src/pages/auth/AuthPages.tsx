import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi, workspaceApi } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'

function parseError(err: any, fallback: string): string {
  const detail = err?.response?.data?.detail
  if (Array.isArray(detail)) return detail.map((e: any) => e.msg).join(', ')
  if (typeof detail === 'string') return detail
  return fallback
}

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authApi.login({ email, password })
      const { access_token, tenant_id } = res.data
      localStorage.setItem('token', access_token)
      localStorage.setItem('tenant_id', tenant_id)
      const meRes = await authApi.me()
      login(access_token, meRes.data, tenant_id)

      // Auto-join if they came from an invite link
      const pendingInvite = localStorage.getItem('pendingInvite')
      if (pendingInvite) {
        try {
          const joinRes = await workspaceApi.acceptInvite(pendingInvite)
          // Switch JWT to the joined workspace
          if (joinRes.data?.tenant_id) {
            const switchRes = await authApi.switchWorkspace(joinRes.data.tenant_id)
            const newToken = switchRes.data.access_token
            const newTenantId = switchRes.data.tenant_id
            localStorage.setItem('token', newToken)
            localStorage.setItem('tenant_id', newTenantId)
            const me2 = await authApi.me()
            login(newToken, me2.data, newTenantId)
          }
        } catch { /* ignore */ } finally {
          localStorage.removeItem('pendingInvite')
        }
      }

      navigate('/workspace')
    } catch (err: any) {
      alert(parseError(err, 'Login failed. Check your credentials.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="w-96 rounded-xl bg-white p-8 shadow-md border border-slate-200">
        <h2 className="mb-6 text-2xl font-bold text-slate-900">Sign In</h2>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
          <input
            type="email" required value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="mb-6">
          <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
          <input
            type="password" required value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit" disabled={loading}
          className="w-full rounded-md bg-blue-600 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Login'}
        </button>

        <p className="mt-4 text-center text-sm text-slate-600">
          Don't have an account?{' '}
          <Link to="/register" className="text-blue-600 hover:underline">Register here</Link>
        </p>
      </form>
    </div>
  )
}

export function RegisterPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '', workspace_name: '', full_name: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await authApi.register(form)
      const { access_token, tenant_id } = res.data
      localStorage.setItem('token', access_token)
      localStorage.setItem('tenant_id', tenant_id)
      const meRes = await authApi.me()
      login(access_token, meRes.data, tenant_id)

      // Auto-join if they came from an invite link
      const pendingInvite = localStorage.getItem('pendingInvite')
      if (pendingInvite) {
        try {
          const joinRes = await workspaceApi.acceptInvite(pendingInvite)
          // Switch JWT to the joined workspace
          if (joinRes.data?.tenant_id) {
            const switchRes = await authApi.switchWorkspace(joinRes.data.tenant_id)
            const newToken = switchRes.data.access_token
            const newTenantId = switchRes.data.tenant_id
            localStorage.setItem('token', newToken)
            localStorage.setItem('tenant_id', newTenantId)
            const me2 = await authApi.me()
            login(newToken, me2.data, newTenantId)
          }
        } catch { /* ignore */ } finally {
          localStorage.removeItem('pendingInvite')
        }
      }

      navigate('/workspace')
    } catch (err: any) {
      alert(parseError(err, 'Registration failed.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="w-96 rounded-xl bg-white p-8 shadow-md border border-slate-200">
        <h2 className="mb-6 text-2xl font-bold text-slate-900">Create an Account</h2>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">Workspace Name</label>
          <input
            type="text" required value={form.workspace_name}
            onChange={e => setForm(f => ({ ...f, workspace_name: e.target.value }))}
            className="w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">Your Name</label>
          <input
            type="text" required value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
            placeholder="e.g. Harshini"
            className="w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
          <input
            type="email" required value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            className="w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="mb-6">
          <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
          <input
            type="password" required value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            className="w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit" disabled={loading}
          className="w-full rounded-md bg-green-600 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Register'}
        </button>

        <p className="mt-4 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:underline">Login here</Link>
        </p>
      </form>
    </div>
  )
}