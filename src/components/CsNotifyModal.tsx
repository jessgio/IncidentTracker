'use client'

import { useMemo, useState } from 'react'
import {
  CS_NOTIFY_TEMPLATES,
  getCsNotifyTemplate,
  type CsNotifyTemplateId,
} from '../lib/cs-notify-templates'

type CsMember = { id: string; full_name: string | null; email: string }

function defaultSelected(members: CsMember[], assignedPicId: string | null) {
  if (assignedPicId && members.some(m => m.id === assignedPicId)) {
    return new Set([assignedPicId])
  }
  return new Set(members.map(m => m.id))
}

export function CsNotifyModal({
  orderNumber,
  warehouseStatus,
  bpbNumber,
  customerAddress,
  courier,
  shippingLabel,
  members,
  assignedPicId,
  onClose,
  onSend,
}: {
  orderNumber: string
  warehouseStatus: string | null | undefined
  bpbNumber?: string | null
  customerAddress?: string | null
  courier?: string | null
  shippingLabel?: string | null
  members: CsMember[]
  assignedPicId: string | null
  onClose: () => void
  onSend: (
    recipientIds: string[],
    message: string,
    templateId: CsNotifyTemplateId
  ) => Promise<{ ok: boolean; error?: string }>
}) {
  const [templateId, setTemplateId] = useState<CsNotifyTemplateId>('request_completed')
  const templateCtx = useMemo(
    () => ({
      warehouseStatus,
      orderNumber,
      bpb_number: bpbNumber,
      customer_address: customerAddress,
      courier,
      shipping_label: shippingLabel,
    }),
    [warehouseStatus, orderNumber, bpbNumber, customerAddress, courier, shippingLabel]
  )
  const [message, setMessage] = useState(() =>
    getCsNotifyTemplate('request_completed').buildMessage(templateCtx)
  )
  const [selected, setSelected] = useState<Set<string>>(() => defaultSelected(members, assignedPicId))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const applyTemplate = (id: CsNotifyTemplateId) => {
    setTemplateId(id)
    setMessage(getCsNotifyTemplate(id).buildMessage(templateCtx))
  }

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
      setError('Please enter a message for the CS team.')
      return
    }
    if (selected.size === 0) {
      setError('Select at least one recipient.')
      return
    }
    setSending(true)
    const result = await onSend([...selected], message.trim(), templateId)
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
        aria-labelledby="cs-notify-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 bg-blue-50">
          <div>
            <h2 id="cs-notify-title" className="text-lg font-semibold text-blue-950">
              Email CS team
            </h2>
            <p className="text-sm text-blue-800 mt-0.5">Order #{orderNumber}</p>
          </div>
          <button type="button" onClick={onClose} className="app-btn-ghost w-8 h-8 p-0" aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div>
            <label className="app-label" htmlFor="cs-notify-template">
              Message template
            </label>
            <select
              id="cs-notify-template"
              value={templateId}
              onChange={(e) => applyTemplate(e.target.value as CsNotifyTemplateId)}
              className="app-select w-full mt-1"
            >
              {CS_NOTIFY_TEMPLATES.map(t => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500 mt-1.5">
              Choose a template or write your own — you can edit the text below before sending.
            </p>
          </div>

          {members.length === 0 ? (
            <p className="text-sm text-zinc-600">
              No CS users found. Add team members with the CS or manager role in profiles.
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
                        className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
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
            <label className="app-label" htmlFor="cs-notify-message">
              Message to CS
            </label>
            <textarea
              id="cs-notify-message"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value)
                if (templateId !== 'custom') setTemplateId('custom')
              }}
              rows={6}
              className="app-input resize-y mt-1"
              placeholder="Describe the update for CS…"
              disabled={members.length === 0}
            />
            <p className="text-xs text-zinc-500 mt-1.5">
              BPB #, address, courier, and shipping label are added to your message when filled in on the case.
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
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
