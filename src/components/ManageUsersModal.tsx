'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import type { UserRole } from '../lib/incident-status'

type ProfileUser = {
  id: string
  full_name: string | null
  email: string
  role: UserRole
}

const ROLE_LABEL: Record<UserRole, string> = {
  cs: 'CS',
  warehouse: 'Warehouse',
  manager: 'Manager',
}

const MIN_PASSWORD_LENGTH = 8

export function ManageUsersModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<ProfileUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activeUserId, setActiveUserId] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    void fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    setLoadError('')

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .order('full_name', { ascending: true })

    if (error) {
      setLoadError('Could not load users.')
    } else {
      setUsers((data ?? []) as ProfileUser[])
    }

    setLoading(false)
  }

  const openResetForm = (userId: string) => {
    setActiveUserId(userId)
    setPassword('')
    setConfirmPassword('')
    setSubmitError('')
    setSuccessMessage('')
  }

  const closeResetForm = () => {
    setActiveUserId(null)
    setPassword('')
    setConfirmPassword('')
    setSubmitError('')
  }

  const handleSubmit = async (e: React.FormEvent, user: ProfileUser) => {
    e.preventDefault()
    setSubmitError('')
    setSuccessMessage('')

    if (password.length < MIN_PASSWORD_LENGTH) {
      setSubmitError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setSubmitError(typeof data.error === 'string' ? data.error : 'Could not update password.')
        return
      }

      const label = user.full_name || user.email
      setSuccessMessage(`Password updated for ${label}.`)
      setPassword('')
      setConfirmPassword('')
      setActiveUserId(null)
    } catch {
      setSubmitError('Could not update password. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-zinc-900/50 z-40" onClick={onClose} aria-hidden />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="app-card w-full max-w-lg pointer-events-auto overflow-hidden"
          role="dialog"
          aria-labelledby="manage-users-title"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 bg-zinc-50">
            <div>
              <h2 id="manage-users-title" className="text-lg font-semibold text-zinc-900">
                Manage users
              </h2>
              <p className="text-xs text-zinc-600 mt-0.5">
                Set a new password for any team member.
              </p>
            </div>
            <button type="button" onClick={onClose} className="app-btn-ghost w-8 h-8 p-0" aria-label="Close">
              ×
            </button>
          </div>

          <div className="px-4 py-3 max-h-[420px] overflow-y-auto">
            {loadError && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 text-red-800 text-xs font-medium rounded-lg">
                {loadError}
              </div>
            )}

            {successMessage && (
              <div className="mb-3 px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded-lg">
                {successMessage}
              </div>
            )}

            {loading && (
              <p className="text-sm text-zinc-600 text-center py-10">Loading users…</p>
            )}

            {!loading && users.length === 0 && !loadError && (
              <div className="text-center py-10 rounded-lg border border-dashed border-zinc-200 bg-zinc-50">
                <p className="text-sm font-medium text-zinc-600">No users found</p>
              </div>
            )}

            <ul className="space-y-2">
              {users.map(user => (
                <li
                  key={user.id}
                  className="rounded-lg border border-zinc-200 bg-white overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">
                        {user.full_name || user.email}
                      </p>
                      {user.full_name && (
                        <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-semibold px-2 py-1 rounded-md bg-zinc-100 text-zinc-700 border border-zinc-200">
                        {ROLE_LABEL[user.role] ?? user.role}
                      </span>
                      <button
                        type="button"
                        onClick={() => (
                          activeUserId === user.id ? closeResetForm() : openResetForm(user.id)
                        )}
                        className="text-xs font-semibold text-blue-700 hover:text-white bg-blue-50 hover:bg-blue-600 px-2.5 py-1.5 rounded-md transition border border-blue-200 hover:border-blue-600"
                      >
                        {activeUserId === user.id ? 'Cancel' : 'Set password'}
                      </button>
                    </div>
                  </div>

                  {activeUserId === user.id && (
                    <form
                      onSubmit={(e) => void handleSubmit(e, user)}
                      className="px-3 pb-3 pt-0 border-t border-zinc-100 bg-zinc-50"
                    >
                      {submitError && (
                        <div className="mt-3 mb-2 px-3 py-2 bg-red-50 border border-red-200 text-red-800 text-xs font-medium rounded-lg">
                          {submitError}
                        </div>
                      )}

                      <div className="mt-3 space-y-3">
                        <div>
                          <label className="app-label" htmlFor={`password-${user.id}`}>
                            New password
                          </label>
                          <input
                            id={`password-${user.id}`}
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="app-input mt-1"
                            autoComplete="new-password"
                            minLength={MIN_PASSWORD_LENGTH}
                            required
                          />
                        </div>
                        <div>
                          <label className="app-label" htmlFor={`confirm-${user.id}`}>
                            Confirm password
                          </label>
                          <input
                            id={`confirm-${user.id}`}
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="app-input mt-1"
                            autoComplete="new-password"
                            minLength={MIN_PASSWORD_LENGTH}
                            required
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="app-btn-primary w-full disabled:opacity-50"
                        >
                          {isSubmitting ? 'Updating…' : 'Update password'}
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="px-4 py-4 border-t border-zinc-200 bg-zinc-50">
            <p className="text-xs text-zinc-600 text-center">
              Passwords are set immediately in Supabase. Share the new password with the user securely.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
