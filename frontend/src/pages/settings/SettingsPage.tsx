import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workspaceApi, billingApi, authApi } from '../../api/client'
import { useAuth } from '../../hooks/useAuth'
import Navbar from '../../components/layout/Navbar'

// ── Role configuration ──────────────────────────────────────────────────────
const ROLE_BADGE: Record<string, string> = {
  owner:  'bg-purple-100 text-purple-800',
  admin:  'bg-blue-100   text-blue-800',
  member: 'bg-green-100  text-green-800',
  viewer: 'bg-slate-100  text-slate-700',
}

const ROLE_DESCRIPTION: Record<string, string> = {
  owner:  'Full control — cannot be removed or demoted',
  admin:  'Can invite, remove members, rename workspace',
  member: 'Can create and manage tasks',
  viewer: 'Read-only access to tasks and boards',
}

// Roles an admin is allowed to assign (admins cannot assign owner or demote to owner)
const ASSIGNABLE_ROLES = ['admin', 'member', 'viewer']

// ── Component ───────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { user, refreshUser } = useAuth()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [newName, setNewName]       = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteTeamId, setInviteTeamId] = useState('')
  const [fullName, setFullName]     = useState(user?.full_name || '')
  const [copiedLink, setCopiedLink] = useState(false)

  // Handle Stripe redirect query params
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('success')) alert('🎉 Payment successful! You are now on the Pro plan.')
    if (p.get('canceled')) alert('Payment was canceled.')
  }, [])

  // ── Data fetching ────────────────────────────────────────────────────────
  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: () => workspaceApi.get().then(r => r.data),
  })
  useEffect(() => {
    if (workspace?.name && !newName) setNewName(workspace.name)
  }, [workspace?.name])

  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: () => workspaceApi.listTeams().then(r => r.data),
  })
  useEffect(() => {
    if (teams?.length > 0 && !inviteTeamId) setInviteTeamId(teams[0].id)
  }, [teams])

  const { data: membersData } = useQuery({
    queryKey: ['members', inviteTeamId],
    queryFn: () => workspaceApi.listMembers(inviteTeamId).then(r => r.data),
    enabled: !!inviteTeamId,
  })
  const members: any[] = membersData || []

  // ── Derive current user's role ────────────────────────────────────────────
  // While teams/members are still loading, show a neutral loading state
  const teamsLoaded   = teams !== undefined
  const membersLoaded = !inviteTeamId || membersData !== undefined

  const currentMember = members.find((m: any) => m.email === user?.email)
  const currentRole: string = currentMember?.role || 'member'
  const isOwner     = currentRole === 'owner'
  const isAdmin     = currentRole === 'admin'
  const isPrivileged = isOwner || isAdmin   // can invite / remove / rename

  // ── Mutations ────────────────────────────────────────────────────────────
  const updateWorkspace = useMutation({
    mutationFn: () => workspaceApi.update({ name: newName }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workspace'] }); alert('Workspace updated!') },
    onError:   () => alert('Failed to update workspace.'),
  })

  const inviteByEmail = useMutation({
    mutationFn: () => workspaceApi.inviteByEmail(inviteTeamId, inviteEmail),
    onSuccess: () => { const e = inviteEmail; setInviteEmail(''); alert(`Invite sent to ${e}!`) },
    onError:   (err: any) => alert(err.response?.data?.detail || 'Failed to send invite.'),
  })

  const inviteByLink = useMutation({
    mutationFn: () => workspaceApi.inviteByLink(inviteTeamId),
    onSuccess: (res: any) => {
      const url = res.data.invite_url
      navigator.clipboard.writeText(url)
        .then(() => { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2500) })
        .catch(() => alert(`Copy this link manually:\n${url}`))
    },
    onError: (err: any) => alert(err.response?.data?.detail || 'Failed to generate link.'),
  })

  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      workspaceApi.updateRole(inviteTeamId, userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', inviteTeamId] }),
    onError:   (err: any) => alert(err.response?.data?.detail || 'Failed to update role.'),
  })

  const removeMember = useMutation({
    mutationFn: ({ userId }: { userId: string }) =>
      workspaceApi.removeMember(inviteTeamId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', inviteTeamId] }),
    onError:   (err: any) => alert(err.response?.data?.detail || 'Failed to remove member.'),
  })

  const updateProfile = useMutation({
    mutationFn: () => authApi.updateProfile({ full_name: fullName }),
    onSuccess: () => { refreshUser(); alert('Profile updated!') },
  })

  const [avatarDisplayUrl, setAvatarDisplayUrl] = useState<string | null>(null)

  // Fetch a fresh pre-signed URL for the avatar on mount
  useEffect(() => {
    if (user?.profile_picture_url) {
      authApi.getAvatarUrl()
        .then(r => setAvatarDisplayUrl(r.data.url))
        .catch(() => setAvatarDisplayUrl(null))
    }
  }, [user?.profile_picture_url])

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const res = await authApi.presignAvatar(file.type)
      const { upload_url, s3_key } = res.data
      await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      await authApi.updateAvatarKey(s3_key)
      refreshUser()
      const urlRes = await authApi.getAvatarUrl()
      setAvatarDisplayUrl(urlRes.data.url)
      alert('Avatar updated!')
    } catch {
      alert('Failed to upload avatar.')
    }
  }

  const checkout = useMutation({
    mutationFn: () => billingApi.checkout().then((r: any) => { window.location.href = r.data.checkout_url }),
  })
  const portal = useMutation({
    mutationFn: () => billingApi.portal().then((r: any) => { window.location.href = r.data.portal_url }),
  })

  const isPro = workspace?.subscription_status === 'active'

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-2 text-3xl font-bold text-slate-900">Workspace Settings</h1>

        {/* Current user's role badge */}
        {membersLoaded && currentMember && (
          <div className="mb-8 flex items-center gap-2">
            <span className="text-sm text-slate-500">Your role:</span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${ROLE_BADGE[currentRole]}`}>
              {currentRole}
            </span>
            <span className="text-xs text-slate-400">— {ROLE_DESCRIPTION[currentRole]}</span>
          </div>
        )}

        {/* ── Billing & Subscription ─────────────────────────────────────── */}
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Billing & Subscription</h2>
          <div className={`flex flex-col gap-4 rounded-lg border p-5 sm:flex-row sm:items-start sm:justify-between ${
            isPro ? 'border-purple-200 bg-purple-50' : 'border-slate-200 bg-slate-50'
          }`}>
            <div>
              <p className="text-lg font-medium text-slate-900">
                Current Plan:{' '}
                <span className={`ml-1 font-bold uppercase ${isPro ? 'text-purple-600' : 'text-blue-600'}`}>
                  {isPro ? 'Pro' : 'Free'}
                </span>
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {isPro
                  ? 'You have full access to all features.'
                  : 'Upgrade to Pro to remove all limits.'}
              </p>
              {!isPro && (
                <ul className="mt-3 space-y-1">
                  {[
                    'Unlimited projects (free: 10)',
                    'Unlimited team members (free: 5)',
                    'Unlimited file attachments',
                    'Unlimited AI task refinements',
                    'Full analytics history',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="text-green-500 font-bold">✓</span> {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex-shrink-0">
              {isPro ? (
                <button
                  onClick={() => portal.mutate()} disabled={portal.isPending}
                  className="whitespace-nowrap rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  {portal.isPending ? 'Loading...' : 'Manage subscription'}
                </button>
              ) : (
                <button
                  onClick={() => checkout.mutate()} disabled={checkout.isPending}
                  className="whitespace-nowrap rounded-md bg-purple-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {checkout.isPending ? 'Redirecting...' : 'Upgrade to Pro ($15/mo)'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── General — workspace name (owner/admin only) ────────────────── */}
        {isPrivileged && (
          <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-slate-900">General</h2>
            <label className="mb-1 block text-sm font-medium text-slate-700">Workspace name</label>
            <form
              onSubmit={e => { e.preventDefault(); updateWorkspace.mutate() }}
              className="flex gap-3"
            >
              <input
                type="text" required value={newName}
                onChange={e => setNewName(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit" disabled={updateWorkspace.isPending || !newName.trim()}
                className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
              >
                {updateWorkspace.isPending ? 'Saving...' : 'Save Name'}
              </button>
            </form>
          </div>
        )}

        {/* ── Invite Teammate (owner/admin only) ────────────────────────── */}
        {isPrivileged && (
          <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-slate-900">Invite Teammate</h2>

            {!inviteTeamId ? (
              <div className="text-sm text-slate-400 animate-pulse">Loading...</div>
            ) : (
              <>
                {/* Email invite */}
                <form
                  onSubmit={e => { e.preventDefault(); inviteEmail.trim() && inviteByEmail.mutate() }}
                  className="flex gap-3"
                >
                  <input
                    type="email" required placeholder="teammate@example.com"
                    value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                    className="flex-1 rounded-md border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="submit" disabled={inviteByEmail.isPending || !inviteEmail.trim()}
                    className="whitespace-nowrap rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {inviteByEmail.isPending ? 'Sending...' : 'Send Invite'}
                  </button>
                </form>

                {/* Divider */}
                <div className="my-4 flex items-center gap-3">
                  <div className="flex-1 border-t border-slate-200" />
                  <span className="text-xs font-medium text-slate-400">or share a link</span>
                  <div className="flex-1 border-t border-slate-200" />
                </div>

                {/* Copy link */}
                <button
                  type="button" onClick={() => inviteByLink.mutate()} disabled={inviteByLink.isPending}
                  className={`flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                    copiedLink
                      ? 'border-green-300 bg-green-50 text-green-700'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {inviteByLink.isPending ? '⏳ Generating...'
                    : copiedLink ? '✓ Link copied to clipboard!'
                    : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy invite link
                      </>
                    )
                  }
                </button>

                <p className="mt-2 text-xs text-slate-400">
                  New members join as <strong>member</strong> role by default.
                  You can change their role below after they join.
                  Links expire in 7 days.
                </p>
              </>
            )}
          </div>
        )}

        {/* ── Team Members ───────────────────────────────────────────────── */}
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">
              Team Members
              {members.length > 0 && (
                <span className="ml-2 text-base font-normal text-slate-400">({members.length})</span>
              )}
            </h2>
            {/* Role legend */}
            <div className="hidden sm:flex items-center gap-3">
              {Object.entries(ROLE_BADGE).map(([role, cls]) => (
                <span key={role} className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
                  {role}
                </span>
              ))}
            </div>
          </div>

          {!inviteTeamId ? (
            <p className="text-sm text-slate-400">No team found.</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-slate-500">No members yet. Invite your first teammate above.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {members.map((member: any) => {
                const memberId   = member.user_id || member.id
                const isSelf     = member.email === user?.email
                const isOwnerRow = member.role === 'owner'

                // Can current user change this member's role?
                // — must be privileged, not self, not targeting the owner
                const canChangeRole = isPrivileged && !isSelf && !isOwnerRow

                // Only owner can assign admin; admin can only assign member/viewer
                const rolesForDropdown = isOwner
                  ? ASSIGNABLE_ROLES
                  : ASSIGNABLE_ROLES.filter(r => r !== 'admin')

                return (
                  <li key={member.id} className="flex items-center justify-between py-3 gap-3">
                    {/* Avatar + name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 overflow-hidden">
                        {member.profile_picture_url
                          ? <img src={member.profile_picture_url} alt="" className="h-full w-full object-cover" />
                          : (member.full_name?.[0] || member.email?.[0] || '?').toUpperCase()
                        }
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {member.full_name || member.email}
                          {isSelf && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                        </p>
                        {member.full_name && (
                          <p className="truncate text-xs text-slate-500">{member.email}</p>
                        )}
                      </div>
                    </div>

                    {/* Role + actions */}
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {canChangeRole ? (
                        /* Role dropdown — only shown to privileged users on non-owner non-self rows */
                        <select
                          value={member.role}
                          onChange={e => {
                            if (window.confirm(
                              `Change ${member.email || member.full_name}'s role to "${e.target.value}"?`
                            )) {
                              updateRole.mutate({ userId: memberId, role: e.target.value })
                            }
                          }}
                          disabled={updateRole.isPending}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 cursor-pointer"
                        >
                          {rolesForDropdown.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      ) : (
                        /* Static badge for self, owner row, or non-privileged viewer */
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                          ROLE_BADGE[member.role] || ROLE_BADGE.member
                        }`}>
                          {member.role}
                        </span>
                      )}

                      {/* Remove button — privileged, not self, not owner */}
                      {canChangeRole && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Remove ${member.email} from the workspace?`)) {
                              removeMember.mutate({ userId: memberId })
                            }
                          }}
                          disabled={removeMember.isPending}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Role legend (mobile — shown below list) */}
          <div className="mt-4 sm:hidden border-t border-slate-100 pt-4 space-y-1">
            {Object.entries(ROLE_DESCRIPTION).map(([role, desc]) => (
              <div key={role} className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide flex-shrink-0 ${ROLE_BADGE[role]}`}>
                  {role}
                </span>
                <span className="text-xs text-slate-500">{desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Your Profile ───────────────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Your Profile</h2>

          <div className="mb-6 flex items-center gap-4">
            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-full bg-blue-500 flex items-center justify-center text-white text-xl font-bold">
              {avatarDisplayUrl
                ? <img src={avatarDisplayUrl} alt="avatar" className="h-full w-full object-cover" />
                : (user?.full_name?.[0] || user?.email?.[0] || 'U').toUpperCase()
              }
            </div>
            <div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              <button
                onClick={() => fileRef.current?.click()}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Change photo
              </button>
              <p className="mt-1 text-xs text-slate-400">JPG or PNG, max 5MB</p>
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">Full name</label>
            <input
              value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="Your display name"
              className="w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input
              value={user?.email || ''} disabled
              className="w-full rounded-md border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-400"
            />
          </div>
          <button
            onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {updateProfile.isPending ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

      </main>
    </div>
  )
}
