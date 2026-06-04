'use client'

import { useState } from 'react'

type WarehouseMember = { id: string; full_name: string | null; email: string }

export function WarehouseNotifyModal({
  orderNumber,
  members,
  onClose,
  onSend,
}: {
  orderNumber: string
  members: WarehouseMember[]
  onClose: () => void
  onSend: (recipientIds: string[], message: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(members.map(m => m.id)))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!message.trim()) {
      setError('Please describe what you need from the warehouse team.')
      return
    }
    if (selected.size === 0) {
      setError('Select at least one recipient.')
      return
    }
    setSending(true)
    const result = await onSend([...selected], message.trim())
    setSending(false)
    if (!result.ok) {
      setError(result.error ?? 'Could not send email.')
      return
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-zinc-900/50 z-[60] flex items-center justify-center p-4">
      <div
        className="app-card w-full max-w-lg max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-labelledby="warehouse-notify-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 bg-orange-50">
          <div>
            <h2 id="warehouse-notify-title" className="text-lg font-semibold text-orange-950">
              Email warehouse team
            </h2>
            <p className="text-sm text-orange-800 mt-0.5">Order #{orderNumber}</p>
          </div>
          <button type="button" onClick={onClose} className="app-btn-ghost w-8 h-8 p-0" aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {members.length === 0 ? (
            <p className="text-sm text-zinc-600">
              No warehouse users found. Add team members with the warehouse role in Supabase profiles.
            </p>
          ) : (
            <div>
              <p className="app-label mb-2">Send to</p>
              <ul className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 max-h-36 overflow-y-auto">
                {members.map(m => (
                  <li key={m.id}>
                    <label className="flex items-center gap-2.5 cursor-pointer text-sm text-zinc-900">
                      <input
                        type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={() => toggle(m.id)}
                        className="rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
                      />
                      <span className="font-medium">{m.full_name || m.email}</span>
                      {m.full_name && (
                        <span className="text-zinc-500 truncate">{m.email}</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="app-label" htmlFor="warehouse-notify-message">
              Your message to warehouse
            </label>
            <textarea
              id="warehouse-notify-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="app-input resize-y mt-1"
              placeholder="e.g. Please prepare a replacement coco vanity bag and ship to the address below. Use JNE if possible."
              disabled={members.length === 0}
            />
            <p className="text-xs text-zinc-500 mt-1.5">
              Case details are included automatically in the email.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="app-btn-secondary flex-1" disabled={sending}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || members.length === 0}
              className="flex-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 transition disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
