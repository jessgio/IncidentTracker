'use client'

import { useCallback, useRef, useState } from 'react'
import {
  getActiveMentionQuery,
  insertMentionToken,
  type MentionActiveQuery,
} from '../lib/comment-mentions'

export type MentionableUser = {
  id: string
  full_name: string
  email: string
}

export function MentionTextarea({
  value,
  onChange,
  members,
  currentUserId,
  disabled,
  placeholder,
  className,
  onSubmit,
  emailAlertsEnabled,
}: {
  value: string
  onChange: (value: string) => void
  members: MentionableUser[]
  currentUserId: string
  disabled?: boolean
  placeholder?: string
  className?: string
  onSubmit?: () => void
  emailAlertsEnabled?: boolean
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [activeMention, setActiveMention] = useState<MentionActiveQuery | null>(null)
  const [highlightIndex, setHighlightIndex] = useState(0)

  const syncMentionState = useCallback((text: string, caret: number) => {
    const active = getActiveMentionQuery(text, caret)
    setActiveMention(active)
    setHighlightIndex(0)
  }, [])

  const mentionCandidates = activeMention
    ? members
        .filter(m => m.id !== currentUserId)
        .filter(m => {
          const label = (m.full_name || m.email).toLowerCase()
          const q = activeMention.query.toLowerCase()
          return !q || label.includes(q) || m.email.toLowerCase().includes(q)
        })
        .slice(0, 8)
    : []

  const applyMention = (member: MentionableUser) => {
    const el = textareaRef.current
    if (!el || !activeMention) return
    const displayName = member.full_name || member.email
    const { text, caret } = insertMentionToken(
      value,
      el.selectionStart,
      activeMention,
      displayName,
      member.id
    )
    onChange(text)
    setActiveMention(null)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
    syncMentionState(e.target.value, e.target.selectionStart)
  }

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    syncMentionState(el.value, el.selectionStart)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionCandidates.length > 0 && activeMention) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex(i => (i + 1) % mentionCandidates.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex(i => (i - 1 + mentionCandidates.length) % mentionCandidates.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        applyMention(mentionCandidates[highlightIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setActiveMention(null)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit?.()
    }
  }

  return (
    <div className="relative flex-1 min-w-0">
      {mentionCandidates.length > 0 && (
        <ul
          className="absolute bottom-full left-0 right-0 mb-1 max-h-48 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg z-20 py-1"
          role="listbox"
        >
          {mentionCandidates.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === highlightIndex}>
              <button
                type="button"
                className={`w-full text-left px-3 py-2 text-sm transition ${
                  i === highlightIndex ? 'bg-blue-50 text-blue-900' : 'text-zinc-900 hover:bg-zinc-50'
                }`}
                onMouseDown={e => {
                  e.preventDefault()
                  applyMention(m)
                }}
              >
                <span className="font-semibold">{m.full_name || m.email}</span>
                {m.full_name && (
                  <span className="block text-xs text-zinc-500 truncate">{m.email}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onSelect={handleSelect}
        onClick={handleSelect}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        className={className}
        aria-label="Write a comment"
        aria-autocomplete={activeMention ? 'list' : undefined}
      />
      <p className="mt-1 text-xs text-zinc-500">
        Type <span className="font-mono">@</span> to mention a teammate
        {emailAlertsEnabled
          ? ' — they will get an email and the chat will be notified in Lark.'
          : ' — Lark is notified; email stays off unless Email alerts is on for this case.'}
      </p>
    </div>
  )
}
