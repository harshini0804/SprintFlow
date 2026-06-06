import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi, workspaceApi } from '../../api/client'

interface Props {
  task: any
  onClose: () => void
  onTaskUpdated: () => void
}

export default function TaskDetails({ task, onClose, onTaskUpdated }: Props) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || '')
  const [assigneeId, setAssigneeId] = useState(task.assignee?.id || '')
  const [newComment, setNewComment] = useState('')
  const [activeTab, setActiveTab] = useState<'comments' | 'activity' | 'attachments'>('comments')
  const [uploading, setUploading] = useState(false)

  // Sync state when task prop changes
  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description || '')
    setAssigneeId(task.assignee?.id || '')
  }, [task])

  const { data: comments } = useQuery({
    queryKey: ['comments', task.id],
    queryFn: () => tasksApi.getComments(task.id).then(r => r.data),
  })

  const { data: activity } = useQuery({
    queryKey: ['activity', task.id],
    queryFn: () => tasksApi.getActivity(task.id).then(r => r.data),
    enabled: activeTab === 'activity',
  })

  const { data: attachments } = useQuery({
    queryKey: ['attachments', task.id],
    queryFn: () => tasksApi.getAttachments(task.id).then(r => r.data),
    enabled: activeTab === 'attachments',
  })

  // Fetch workspace members for assignee dropdown
  const { data: workspaceData } = useQuery({
    queryKey: ['workspace-members'],
    queryFn: async () => {
      const teams = await workspaceApi.listTeams()
      if (teams.data.length > 0) {
        const members = await workspaceApi.listMembers(teams.data[0].id)
        return members.data
      }
      return []
    },
  })
  const members: any[] = workspaceData || []

  const saveDetails = useMutation({
    mutationFn: () => tasksApi.update(task.id, {
      title,
      description,
      assigned_to: assigneeId || null,
    }),
    onSuccess: () => {
      onTaskUpdated()
      qc.invalidateQueries({ queryKey: ['tasks'] })
      alert('Task updated!')
    },
    onError: () => alert('Failed to update task.'),
  })

  const addComment = useMutation({
    mutationFn: () => tasksApi.addComment(task.id, newComment),
    onSuccess: () => {
      setNewComment('')
      qc.invalidateQueries({ queryKey: ['comments', task.id] })
      onTaskUpdated()
    },
    onError: () => alert('Failed to post comment.'),
  })

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => tasksApi.deleteAttachment(task.id, attachmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', task.id] }),
  })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await tasksApi.requestUpload(task.id, {
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
      })
      const { upload_url } = res.data
      await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      qc.invalidateQueries({ queryKey: ['attachments', task.id] })
      onTaskUpdated()
    } catch {
      alert('Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const statusLabel = task.status?.replace('_', ' ') || ''
  const statusColors: Record<string, string> = {
    todo: 'bg-slate-100 text-slate-700',
    in_progress: 'bg-blue-100 text-blue-800',
    in_review: 'bg-amber-100 text-amber-800',
    done: 'bg-green-100 text-green-800',
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 transition-opacity" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusColors[task.status] || 'bg-slate-100 text-slate-700'}`}>
            {statusLabel}
          </span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg font-bold">
            ✕
          </button>
        </div>

        {/* Title + Description + Assignee */}
        <div className="mb-6 border-b border-slate-100 pb-6">
          <input
            type="text" value={title}
            onChange={e => setTitle(e.target.value)}
            className="mb-4 w-full text-xl font-bold text-slate-900 focus:border-blue-500 focus:outline-none border-b border-transparent focus:border-b-blue-300 pb-1"
          />

          <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Add a more detailed description..."
            className="mb-4 w-full rounded-md border border-slate-200 p-3 text-sm focus:border-blue-500 focus:outline-none"
            rows={4}
          />

          <label className="mb-1 block text-sm font-medium text-slate-700">Assign To</label>
          <select
            value={assigneeId}
            onChange={e => setAssigneeId(e.target.value)}
            className="mb-6 w-full rounded-md border border-slate-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">Unassigned</option>
            {members.map((m: any) => (
              <option key={m.user_id || m.id} value={m.user_id || m.id}>
                {m.full_name || m.email}
              </option>
            ))}
          </select>

          <button
            onClick={() => saveDetails.mutate()}
            disabled={saveDetails.isPending}
            className="w-full rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-900 disabled:opacity-50"
          >
            {saveDetails.isPending ? 'Saving...' : 'Save Details'}
          </button>
        </div>

        {/* Tabs */}
        <div>
          <div className="mb-4 flex border-b border-slate-200">
            {(['comments', 'activity', 'attachments'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab === 'activity' ? 'History' : tab}
              </button>
            ))}
          </div>

          {/* Comments tab */}
          {activeTab === 'comments' && (
            <div>
              <form onSubmit={e => { e.preventDefault(); newComment.trim() && addComment.mutate() }} className="mb-6">
                <input
                  type="text" value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="mb-2 w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                />
                <div className="flex justify-end">
                  <button
                    type="submit" disabled={!newComment.trim() || addComment.isPending}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Comment
                  </button>
                </div>
              </form>
              <div className="space-y-4">
                {(comments || []).map((c: any) => (
                  <div key={c.id} className="rounded-lg bg-slate-50 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">
                        {c.author?.full_name || c.author?.email || 'Unknown'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{c.body}</p>
                  </div>
                ))}
                {(comments || []).length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">No comments yet.</p>
                )}
              </div>
            </div>
          )}

          {/* Activity/History tab */}
          {activeTab === 'activity' && (
            <div className="space-y-4">
              {(activity || []).map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-slate-300" />
                  <div>
                    <p className="text-slate-800">
                      <span className="font-medium">{log.actor?.full_name || log.actor?.email}</span>
                      {' '}{log.action.replace(/_/g, ' ')}
                    </p>
                    <span className="text-xs text-slate-500">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
              {(activity || []).length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No activity yet.</p>
              )}
            </div>
          )}

          {/* Attachments tab */}
          {activeTab === 'attachments' && (
            <div>
              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-slate-700">Upload File</label>
                <input
                  ref={fileRef} type="file" onChange={handleFileUpload} disabled={uploading}
                  className="w-full cursor-pointer text-sm text-slate-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
                />
                {uploading && (
                  <p className="mt-2 animate-pulse text-xs text-blue-600">Uploading securely to AWS S3...</p>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="mb-3 text-sm font-semibold text-slate-900">Attached Files</h4>
                {(attachments || []).length === 0 ? (
                  <p className="text-sm text-slate-500">No attachments yet.</p>
                ) : (
                  (attachments || []).map((att: any) => (
                    <div key={att.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3">
                      <span className="max-w-[200px] truncate text-sm font-medium text-slate-700">{att.filename}</span>
                      <div className="flex items-center gap-2">
                        <a
                          href={att.download_url} target="_blank" rel="noreferrer"
                          className="rounded border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-blue-600 shadow-sm hover:text-blue-800"
                        >
                          Download
                        </a>
                        <button
                          onClick={() => deleteAttachment.mutate(att.id)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
