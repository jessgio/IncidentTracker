import type { ReactNode } from 'react'
import { MENTION_TOKEN_REGEX } from '../lib/comment-mentions'

export function CommentBody({
  text,
  highlightClassName = 'font-semibold underline decoration-white/40',
}: {
  text: string
  highlightClassName?: string
}) {
  const parts: ReactNode[] = []
  const re = new RegExp(MENTION_TOKEN_REGEX.source, 'gi')
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>)
    }
    parts.push(
      <span key={key++} className={highlightClassName}>
        @{match[1]}
      </span>
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>)
  }

  if (parts.length === 0) {
    return <>{text}</>
  }

  return <>{parts}</>
}
