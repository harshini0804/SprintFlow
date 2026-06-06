import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { projectsApi, tasksApi } from '../../api/client'
import Navbar from '../../components/layout/Navbar'
import TaskDetails from '../../components/kanban/TaskDetails'

const COLUMNS = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'done', label: 'Done' },
]

const COLUMN_STYLES: Record<string, string> = {
  todo: 'bg-slate-50 border-slate-200',
  in_progress: 'bg-blue-50/50 border-blue-100',
  in_review: 'bg-amber-50/50 border-amber-100',
  done: 'bg-green-50/50 border-green-100',
}

type TasksState = Record<string, any[]>

const EMPTY: TasksState = { todo: [], in_progress: [], in_review: [], done: [] }

export function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
  const [isAiLoading, setIsAiLoading] = useState(false)

  // Local tasks state — single source of truth for the board UI
  const [tasks, setTasks] = useState<TasksState>(EMPTY)
  // Track whether we have loaded from server at least once
  const initialised = useRef(false)
  // Keep a snapshot for reverting failed moves
  const prevTasks = useRef<TasksState>(EMPTY)

  // ── Fetch project info ─────────────────────────────────────────────────
  const { data: projectData } = useQuery({
    queryKey: ['project-meta', projectId],
    queryFn: () => projectsApi.list().then(r => r.data.find((p: any) => p.id === projectId) || null),
    staleTime: Infinity, // project name doesn't change often
  })

  // ── Fetch tasks — manual, not automatic ────────────────────────────────
  const [isLoading, setIsLoading] = useState(true)

  const loadTasks = async () => {
    try {
      const res = await projectsApi.getTasks(projectId!)
      const data = res.data
      setTasks({
        todo: data.todo || [],
        in_progress: data.in_progress || [],
        in_review: data.in_review || [],
        done: data.done || [],
      })
      initialised.current = true
    } catch (e) {
      console.error('Failed to load tasks', e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (projectId) {
      setIsLoading(true)
      loadTasks()
    }
  }, [projectId]) // Only re-fetch when project changes, NOT on every render

  // ── Create task ────────────────────────────────────────────────────────
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    try {
      await projectsApi.createTask(projectId!, {
        title: newTaskTitle.trim(),
        status: 'todo',
        description: '',
      })
      setNewTaskTitle('')
      setAiSuggestions([])
      await loadTasks() // reload after creating
    } catch {
      alert('Failed to create task')
    }
  }

  // ── AI enhance ────────────────────────────────────────────────────────
  const handleEnhance = async () => {
    if (!newTaskTitle.trim()) {
      alert('Please type a few words first so the AI has context!')
      return
    }
    setIsAiLoading(true)
    setAiSuggestions([])
    try {
      const res = await tasksApi.refine(newTaskTitle)
      setAiSuggestions(res.data.suggestions || [])
    } catch {
      alert('Failed to generate suggestions.')
    } finally {
      setIsAiLoading(false)
    }
  }

  // ── Drag and drop ─────────────────────────────────────────────────────
  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) return

    const srcCol = source.droppableId
    const dstCol = destination.droppableId

    // Save snapshot so we can revert if API fails
    prevTasks.current = {
      todo: [...tasks.todo],
      in_progress: [...tasks.in_progress],
      in_review: [...tasks.in_review],
      done: [...tasks.done],
    }

    // Build new state — deep copy affected columns
    const next: TasksState = {
      todo: [...tasks.todo],
      in_progress: [...tasks.in_progress],
      in_review: [...tasks.in_review],
      done: [...tasks.done],
    }

    // Remove from source
    const [movedTask] = next[srcCol].splice(source.index, 1)
    // Update the status field on the task object itself
    const updatedTask = { ...movedTask, status: dstCol }
    // Insert at destination
    next[dstCol].splice(destination.index, 0, updatedTask)

    // Apply immediately — this is what makes it smooth
    setTasks(next)

    // Persist to backend
    try {
      await tasksApi.move(draggableId, {
        status: dstCol,
        position: destination.index,
      })
    } catch (err: any) {
      console.error('Move failed:', err?.response?.data || err)
      // Revert to pre-drag snapshot
      setTasks(prevTasks.current)
      alert('Failed to move task. Please try again.')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />
        <div className="flex flex-1 items-center justify-center text-slate-500 animate-pulse text-sm">
          Loading board...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />

      <main className="flex-1 mx-auto w-full max-w-[1400px] px-6 py-8">

        {/* Project header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            {projectData?.name || 'Project Board'}
          </h1>
          {projectData?.description && (
            <p className="mt-1 text-sm text-slate-500">{projectData.description}</p>
          )}
        </div>

        {/* AI Task Input Bar */}
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <form onSubmit={handleCreateTask} className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Type a new task (e.g. 'fix login bug')"
              value={newTaskTitle}
              onChange={e => { setNewTaskTitle(e.target.value); setAiSuggestions([]) }}
              className="flex-1 rounded-lg border border-slate-300 p-2.5 text-sm text-slate-800 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button" onClick={handleEnhance} disabled={isAiLoading}
              className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50"
            >
              {isAiLoading ? '✨ Thinking...' : '✨ Enhance'}
            </button>
            <button
              type="submit" disabled={!newTaskTitle.trim()}
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              Add Task
            </button>
          </form>

          {aiSuggestions.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="mb-3 text-sm font-medium text-slate-500">
                ✨ Pick a refined alternative:
              </p>
              <div className="flex flex-wrap gap-2">
                {aiSuggestions.map((s, i) => (
                  <button
                    key={i} type="button"
                    onClick={() => { setNewTaskTitle(s); setAiSuggestions([]) }}
                    className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-left text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-purple-600 hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Kanban Board */}
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pb-8">
            {COLUMNS.map(col => {
              const colTasks = tasks[col.id] || []
              return (
                <div
                  key={col.id}
                  className={`flex flex-col rounded-xl border ${COLUMN_STYLES[col.id]} p-4`}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-bold text-slate-700">{col.label}</h2>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-600 shadow-sm">
                      {colTasks.length}
                    </span>
                  </div>

                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`min-h-[200px] rounded-lg p-1 transition-colors ${
                          snapshot.isDraggingOver ? 'bg-slate-200/50' : ''
                        }`}
                      >
                        {colTasks.map((task: any, index: number) => (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => setSelectedTask(task)}
                                className={`mb-3 cursor-pointer rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-blue-400 hover:shadow-md ${
                                  snapshot.isDragging
                                    ? 'rotate-2 scale-105 shadow-xl ring-2 ring-blue-500'
                                    : ''
                                }`}
                              >
                                <p className="line-clamp-2 text-sm font-medium text-slate-900">
                                  {task.title}
                                </p>
                                <div className="mt-4 flex items-center justify-between">
                                  <span className="text-xs font-medium text-slate-400">
                                    {new Date(task.created_at).toLocaleDateString(undefined, {
                                      month: 'short', day: 'numeric',
                                    })}
                                  </span>
                                  {task.assignee ? (
                                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                                      Assigned
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                      Unassigned
                                    </span>
                                  )}
                                </div>
                                {(task.comment_count > 0 || task.attachment_count > 0) && (
                                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
                                    {task.comment_count > 0 && <span>💬 {task.comment_count}</span>}
                                    {task.attachment_count > 0 && <span>📎 {task.attachment_count}</span>}
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      </main>

      {/* Task Detail Slide-over */}
      {selectedTask && (
        <TaskDetails
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onTaskUpdated={async () => {
            await loadTasks()
            setSelectedTask(null)
          }}
        />
      )}
    </div>
  )
}