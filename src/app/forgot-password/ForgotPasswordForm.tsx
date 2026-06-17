'use client'

import Link from 'next/link'
import { useState } from 'react'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setSuccess(false)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.set('email', email)

      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        body: formData,
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        setMessage(payload?.error || 'Could not send reset email. Please try again later.')
        return
      }

      setSuccess(true)
    } catch {
      setMessage('Could not send reset email. Please try again later.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <div>
          <label className="app-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="app-input"
            name="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button type="submit" className="app-btn-primary w-full py-2.5" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </div>

        {success && (
          <p
            role="status"
            className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-center text-sm font-medium text-green-800"
          >
            If an account exists for that email, you&apos;ll receive a reset link shortly.
          </p>
        )}

        {message && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-800"
          >
            {message}
          </p>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-zinc-600">
        <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
          Back to sign in
        </Link>
      </p>
    </>
  )
}
