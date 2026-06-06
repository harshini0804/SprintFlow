import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi } from '../../api/client'
import Navbar from '../../components/layout/Navbar'

export function WorkspacePage() {
  const qc = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list().then(r => r.data),
  })

  const createProject = useMutation({
    mutationFn: () => projectsApi.create({ name, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      setIsModalOpen(false)
      setName('')
      setDescription('')
    },
    onError: () => alert('Failed to create project'),
  })

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Workspace Projects</h2>
          <button
            onClick={() => setIsModalOpen(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            + New Project
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {!projects || projects.length === 0 ? (
              <div className="col-span-3 rounded-xl border-2 border-dashed border-slate-300 p-12 text-center">
                <h3 className="text-sm font-medium text-slate-900">No projects yet</h3>
                <p className="mt-1 text-sm text-slate-500">Get started by creating a new project.</p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Create your first project
                </button>
              </div>
            ) : (
              projects.map((project: any) => {
                const totalTasks = Object.values(project.task_counts || {}).reduce((a: any, b: any) => a + b, 0) as number
                const doneTasks = (project.task_counts?.done || 0) as number
                const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

                return (
                  <Link
                    to={`/projects/${project.id}/board`}
                    key={project.id}
                    className="group block rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
                  >
                    <h3 className="mb-2 text-lg font-semibold text-slate-900 group-hover:text-blue-600">
                      {project.name}
                    </h3>
                    <p className="mb-4 text-sm text-slate-600 line-clamp-2">
                      {project.description || 'No description provided.'}
                    </p>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{totalTasks} task{totalTasks !== 1 ? 's' : ''}</span>
                      <span className="font-medium text-green-600">{pct}% done</span>
                    </div>
                    {totalTasks > 0 && (
                      <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                        <div
                          className="h-1.5 rounded-full bg-green-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </Link>
                )
              })
            )}
          </div>
        )}
      </main>

      {/* Create Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-bold text-slate-900">Create New Project</h2>
            <form onSubmit={e => { e.preventDefault(); createProject.mutate() }}>
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-slate-700">Project Name</label>
                <input
                  type="text" required value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. Mobile App Redesign"
                />
              </div>
              <div className="mb-6">
                <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  rows={3}
                  placeholder="What is this project about?"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); setName(''); setDescription('') }}
                  className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={createProject.isPending}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {createProject.isPending ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
