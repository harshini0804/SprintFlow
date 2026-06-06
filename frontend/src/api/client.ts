// import axios from 'axios'

// const api = axios.create({
//   baseURL: import.meta.env.VITE_API_BASE_URL || '',
//   headers: { 'Content-Type': 'application/json' },
// })

// api.interceptors.request.use((config) => {
//   const token = localStorage.getItem('token')
//   if (token) config.headers.Authorization = `Bearer ${token}`
//   return config
// })

// api.interceptors.response.use(
//   (res) => res,
//   (error) => {
//     if (error.response?.status === 401) {
//       localStorage.removeItem('token')
//       localStorage.removeItem('tenant_id')
//       window.location.href = '/login'
//     }
//     return Promise.reject(error)
//   }
// )

// export default api

// export const authApi = {
//   register: (data: { email: string; password: string; full_name?: string; workspace_name: string }) =>
//     api.post('/api/auth/register', data),
//   login: (data: { email: string; password: string }) =>
//     api.post('/api/auth/login', data),
//   me: () => api.get('/api/auth/me'),
//   updateProfile: (data: { full_name?: string }) => api.patch('/api/auth/me', data),
//   presignAvatar: (content_type: string) =>
//     api.post('/api/auth/me/avatar/presign', { content_type }),
//   updateAvatarUrl: (url: string) => api.patch('/api/auth/me/avatar', { url }),
// }

// export const workspaceApi = {
//   get: () => api.get('/api/workspace'),
//   update: (data: { name?: string; slug?: string }) => api.patch('/api/workspace', data),
//   listTeams: () => api.get('/api/teams'),
//   createTeam: (name: string) => api.post('/api/teams', { name }),
//   listMembers: (teamId: string) => api.get(`/api/teams/${teamId}/members`),
//   updateRole: (teamId: string, userId: string, role: string) =>
//     api.patch(`/api/teams/${teamId}/members/${userId}`, { role }),
//   removeMember: (teamId: string, userId: string) =>
//     api.delete(`/api/teams/${teamId}/members/${userId}`),
//   inviteByEmail: (teamId: string, email: string) =>
//     api.post(`/api/teams/${teamId}/invite-email`, { email }),
//   inviteByLink: (teamId: string) => api.post(`/api/teams/${teamId}/invite-link`),
//   acceptInvite: (token: string) => api.post(`/api/invites/${token}/accept`),
// }

// export const projectsApi = {
//   list: () => api.get('/api/projects'),
//   create: (data: { name: string; description?: string }) => api.post('/api/projects', data),
//   update: (id: string, data: { name?: string; description?: string }) =>
//     api.patch(`/api/projects/${id}`, data),
//   delete: (id: string) => api.delete(`/api/projects/${id}`),
//   getTasks: (id: string) => api.get(`/api/projects/${id}/tasks`),
//   createTask: (projectId: string, data: Record<string, unknown>) =>
//     api.post(`/api/projects/${projectId}/tasks`, data),
// }

// export const tasksApi = {
//   update: (id: string, data: Record<string, unknown>) => api.patch(`/api/tasks/${id}`, data),
//   move: (id: string, data: { status: string; position: number }) =>
//     api.patch(`/api/tasks/${id}/move`, data),
//   delete: (id: string) => api.delete(`/api/tasks/${id}`),
//   getComments: (id: string) => api.get(`/api/tasks/${id}/comments`),
//   addComment: (id: string, body: string) =>
//     api.post(`/api/tasks/${id}/comments`, { body }),
//   getActivity: (id: string) => api.get(`/api/tasks/${id}/activity`),
//   getAttachments: (id: string) => api.get(`/api/tasks/${id}/attachments`),
//   requestUpload: (id: string, data: { filename: string; content_type: string; size_bytes?: number }) =>
//     api.post(`/api/tasks/${id}/attachments`, data),
//   deleteAttachment: (taskId: string, attachmentId: string) =>
//     api.delete(`/api/tasks/${taskId}/attachments/${attachmentId}`),
//   refine: (prompt: string) => api.post('/api/tasks/refine', { prompt }),
// }

// export const notificationsApi = {
//   list: () => api.get('/api/notifications'),
//   markAllRead: () => api.patch('/api/notifications/mark-read'),
// }

// export const analyticsApi = {
//   workspace: () => api.get('/api/analytics/workspace'),
// }

// export const billingApi = {
//   checkout: () => api.post('/api/billing/checkout-session'),
//   portal: () => api.get('/api/billing/portal-session'),
// }

import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('tenant_id')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

export const authApi = {
  register: (data: { email: string; password: string; full_name?: string; workspace_name: string }) =>
    api.post('/api/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/api/auth/login', data),
  me: () => api.get('/api/auth/me'),
  updateProfile: (data: { full_name?: string }) => api.patch('/api/auth/me', data),
  presignAvatar: (content_type: string) =>
    api.post('/api/auth/me/avatar/presign', { content_type }),
  updateAvatarUrl: (url: string) => api.patch('/api/auth/me/avatar', { url }),
  switchWorkspace: (tenant_id: string) =>
    api.post('/api/auth/switch-workspace', { tenant_id }),
}

export const workspaceApi = {
  get: () => api.get('/api/workspace'),
  update: (data: { name?: string; slug?: string }) => api.patch('/api/workspace', data),
  listTeams: () => api.get('/api/teams'),
  createTeam: (name: string) => api.post('/api/teams', { name }),
  listMembers: (teamId: string) => api.get(`/api/teams/${teamId}/members`),
  updateRole: (teamId: string, userId: string, role: string) =>
    api.patch(`/api/teams/${teamId}/members/${userId}`, { role }),
  removeMember: (teamId: string, userId: string) =>
    api.delete(`/api/teams/${teamId}/members/${userId}`),
  inviteByEmail: (teamId: string, email: string) =>
    api.post(`/api/teams/${teamId}/invite-email`, { email }),
  inviteByLink: (teamId: string) => api.post(`/api/teams/${teamId}/invite-link`),
  acceptInvite: (token: string) => api.post(`/api/invites/${token}/accept`),
}

export const projectsApi = {
  list: () => api.get('/api/projects'),
  create: (data: { name: string; description?: string }) => api.post('/api/projects', data),
  update: (id: string, data: { name?: string; description?: string }) =>
    api.patch(`/api/projects/${id}`, data),
  delete: (id: string) => api.delete(`/api/projects/${id}`),
  getTasks: (id: string) => api.get(`/api/projects/${id}/tasks`),
  createTask: (projectId: string, data: Record<string, unknown>) =>
    api.post(`/api/projects/${projectId}/tasks`, data),
}

export const tasksApi = {
  update: (id: string, data: Record<string, unknown>) => api.patch(`/api/tasks/${id}`, data),
  move: (id: string, data: { status: string; position: number }) =>
    api.patch(`/api/tasks/${id}/move`, data),
  delete: (id: string) => api.delete(`/api/tasks/${id}`),
  getComments: (id: string) => api.get(`/api/tasks/${id}/comments`),
  addComment: (id: string, body: string) =>
    api.post(`/api/tasks/${id}/comments`, { body }),
  getActivity: (id: string) => api.get(`/api/tasks/${id}/activity`),
  getAttachments: (id: string) => api.get(`/api/tasks/${id}/attachments`),
  requestUpload: (id: string, data: { filename: string; content_type: string; size_bytes?: number }) =>
    api.post(`/api/tasks/${id}/attachments`, data),
  deleteAttachment: (taskId: string, attachmentId: string) =>
    api.delete(`/api/tasks/${taskId}/attachments/${attachmentId}`),
  refine: (prompt: string) => api.post('/api/tasks/refine', { prompt }),
}

export const notificationsApi = {
  list: () => api.get('/api/notifications'),
  markAllRead: () => api.patch('/api/notifications/mark-read'),
}

export const analyticsApi = {
  workspace: () => api.get('/api/analytics/workspace'),
}

export const billingApi = {
  checkout: () => api.post('/api/billing/checkout-session'),
  portal: () => api.get('/api/billing/portal-session'),
}