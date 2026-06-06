import React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  AreaChart, Area,
} from 'recharts'
import { analyticsApi } from '../../api/client'
import Navbar from '../../components/layout/Navbar'

const STATUS_COLORS: Record<string, string> = {
  'To Do': '#cbd5e1',
  'In Progress': '#3b82f6',
  'In Review': '#f59e0b',
  'Done': '#10b981',
  // backend keys fallback
  todo: '#cbd5e1',
  in_progress: '#3b82f6',
  in_review: '#f59e0b',
  done: '#10b981',
}

function formatStatusName(key: string): string {
  const map: Record<string, string> = {
    todo: 'To Do',
    in_progress: 'In Progress',
    in_review: 'In Review',
    done: 'Done',
  }
  return map[key] || key
}

export function DashboardPage() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => analyticsApi.workspace().then(r => r.data),
  })

  if (isLoading || !analytics) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="flex flex-1 items-center justify-center text-slate-500 animate-pulse text-sm">
          Loading workspace insights...
        </div>
      </div>
    )
  }

  // Build status_distribution in display format from backend's tasks_by_status
  const statusDistribution = Object.entries(analytics.tasks_by_status || {})
    .map(([key, value]) => ({ name: formatStatusName(key), value: value as number }))
    .filter(d => d.value > 0)

  const completedTasks = analytics.tasks_by_status?.done || 0
  const completionRate = analytics.total_tasks > 0
    ? Math.round((completedTasks / analytics.total_tasks) * 100)
    : 0

  // Build workload from projects (per-project task count as proxy for team workload)
  const workloadData = (analytics.projects || [])
    .filter((p: any) => p.total > 0)
    .map((p: any) => ({
      name: p.name.length > 14 ? p.name.slice(0, 14) + '…' : p.name,
      tasks: p.total - (p.done || 0), // active (non-done) tasks
    }))
    .slice(0, 6)

  // Velocity trend — use projects completion as a proxy if no velocity_trend from backend
  const velocityTrend = analytics.velocity_trend || []

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Workspace Overview</h2>
          <Link
            to="/workspace"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            View Projects
          </Link>
        </div>

        {/* Metric Cards */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Total Backlog</h3>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600">📋</span>
            </div>
            <p className="mt-4 text-4xl font-bold text-slate-900">{analytics.total_tasks}</p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 shadow-sm ring-1 ring-blue-500/20 transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-800">Assigned To You</h3>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-200 text-blue-700">👤</span>
            </div>
            <p className="mt-4 text-4xl font-bold text-blue-900">{analytics.my_tasks}</p>
            {analytics.my_tasks > 0 && (
              <p className="mt-2 text-xs font-semibold text-blue-600">Requires your attention</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Completion Rate</h3>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600">🚀</span>
            </div>
            <p className="mt-4 text-4xl font-bold text-slate-900">{completionRate}%</p>
            <p className="mt-2 text-xs text-slate-500">{completedTasks} tasks finished</p>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Velocity / Area Chart — full width */}
          {velocityTrend.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
              <h3 className="mb-6 text-lg font-bold text-slate-800">Task Velocity (Last 7 Days)</h3>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={velocityTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} dy={10} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '14px' }} />
                    <Area type="monotone" dataKey="completed" name="Tasks Completed" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorCompleted)" />
                    <Area type="monotone" dataKey="added" name="New Tasks Added" stroke="#94a3b8" strokeWidth={2} fill="none" strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Status Donut */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold text-slate-800">Current Status</h3>
            {statusDistribution.length === 0 ? (
              <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-sm text-slate-500">
                No tasks in this workspace yet.
              </div>
            ) : (
              <div className="mt-2 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusDistribution}
                      cx="50%" cy="50%"
                      innerRadius={70} outerRadius={90}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {statusDistribution.map((entry, index) => (
                        <Cell key={index} fill={STATUS_COLORS[entry.name] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Legend iconType="circle" layout="vertical" verticalAlign="middle" align="right" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Team Workload (per project active tasks) */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-bold text-slate-800">Active Tasks by Project</h3>
            {workloadData.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 px-4 text-center text-sm text-slate-500">
                <span className="mb-1 text-2xl">📋</span>
                <p>No active tasks found.</p>
                <p>Create tasks on the board to see workload!</p>
              </div>
            ) : (
              <div className="mt-2 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={workloadData} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#334155', fontWeight: 500 }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="tasks" name="Active Tasks" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Due this week card */}
          {analytics.due_this_week > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm lg:col-span-2">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="font-semibold text-amber-900">
                    {analytics.due_this_week} task{analytics.due_this_week > 1 ? 's' : ''} due this week
                  </p>
                  <p className="text-sm text-amber-700">
                    Check your boards to stay on track.{' '}
                    <Link to="/workspace" className="font-medium underline hover:text-amber-900">
                      Go to projects →
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
