import { commentTextToPlain } from './comment-mentions'
import type { LarkInteractiveCard } from './lark'

function line(label: string, value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  return `${label}: ${value.trim()}`
}

function compactMessage(parts: Array<string | null | undefined | false>): string {
  return parts.filter((part): part is string => Boolean(part)).join('\n').trim()
}

function escapeLarkMd(text: string): string {
  return text.replace(/([\\`*_[\]()#+\-.!|{}>])/g, '\\$1')
}

function larkMdParagraph(content: string) {
  return {
    tag: 'div' as const,
    text: { tag: 'lark_md' as const, content },
  }
}

/** Rich post-style comment card (interactive + lark_md for bold comment body). */
export function buildCommentLarkPost(opts: {
  orderNumber: string
  caseTitle: string
  status: string
  authorName: string
  mentionedNames?: string[]
  commentPlain: string
  caseUrl: string
}): LarkInteractiveCard {
  const { orderNumber, caseTitle, status, authorName, mentionedNames, commentPlain, caseUrl } = opts
  const mentionedLine =
    mentionedNames && mentionedNames.length > 0
      ? `Mentioned: ${mentionedNames.map(name => `@${name}`).join(', ')}`
      : null
  const metadata = compactMessage([
    line('Order', `#${orderNumber}`),
    line('Case', caseTitle),
    line('Status', status),
    line('From', authorName),
    mentionedLine,
  ])
  const comment = commentPlain.trim()

  return {
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: 'Incident Tracker — 💬 New case comment' },
    },
    elements: [
      larkMdParagraph(metadata),
      larkMdParagraph(''),
      larkMdParagraph(`**${escapeLarkMd(comment)}**`),
      larkMdParagraph(''),
      larkMdParagraph(`[Open case](${caseUrl})`),
    ],
  }
}

export function buildWaitingOnWarehouseLarkText(opts: {
  orderNumber: string
  caseTitle: string
  category: string | null
  marketplace: string | null
  warehouseStatus: string | null
  actorName: string
  caseUrl: string
}) {
  const {
    orderNumber,
    caseTitle,
    category,
    marketplace,
    warehouseStatus,
    actorName,
    caseUrl,
  } = opts
  return compactMessage([
    '📦 Warehouse handoff',
    line('Order', `#${orderNumber}`),
    line('Case', caseTitle),
    line('Category', category ?? undefined),
    line('Marketplace', marketplace ?? undefined),
    line('Warehouse status', warehouseStatus ?? 'Requested'),
    line('Handed off by', actorName),
    `Open case: ${caseUrl}`,
  ])
}

export function buildWarehouseCompletedLarkText(opts: {
  orderNumber: string
  caseTitle: string
  actorName: string
  caseUrl: string
}) {
  const { orderNumber, caseTitle, actorName, caseUrl } = opts
  return compactMessage([
    '✅ Warehouse fulfillment completed',
    line('Order', `#${orderNumber}`),
    line('Case', caseTitle),
    line('Completed by', actorName),
    'Case returned to CS for customer follow-up.',
    `Open case: ${caseUrl}`,
  ])
}

export function commentToLarkPlain(commentText: string) {
  return commentTextToPlain(commentText)
}
