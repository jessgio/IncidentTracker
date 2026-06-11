import { commentTextToPlain } from './comment-mentions'

function line(label: string, value: string | null | undefined) {
  if (!value?.trim()) return ''
  return `${label}: ${value.trim()}\n`
}

export function buildCommentLarkText(opts: {
  orderNumber: string
  caseTitle: string
  status: string
  authorName: string
  mentionedNames?: string[]
  commentPlain: string
  caseUrl: string
}) {
  const { orderNumber, caseTitle, status, authorName, mentionedNames, commentPlain, caseUrl } = opts
  const mentionedLine =
    mentionedNames && mentionedNames.length > 0
      ? `Mentioned: ${mentionedNames.map(name => `@${name}`).join(', ')}\n`
      : ''
  return [
    'Incident Tracker — 💬 New case comment',
    '',
    line('Order', `#${orderNumber}`),
    line('Case', caseTitle),
    line('Status', status),
    line('From', authorName),
    mentionedLine.trimEnd(),
    '',
    commentPlain.trim(),
    '',
    `Open case: ${caseUrl}`,
  ]
    .filter((row, i, arr) => row !== '' || (i > 0 && arr[i - 1] !== ''))
    .join('\n')
    .trim()
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
  return [
    '📦 Warehouse handoff',
    '',
    line('Order', `#${orderNumber}`),
    line('Case', caseTitle),
    line('Category', category ?? undefined),
    line('Marketplace', marketplace ?? undefined),
    line('Warehouse status', warehouseStatus ?? 'Requested'),
    line('Handed off by', actorName),
    '',
    `Open case: ${caseUrl}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildWarehouseCompletedLarkText(opts: {
  orderNumber: string
  caseTitle: string
  actorName: string
  caseUrl: string
}) {
  const { orderNumber, caseTitle, actorName, caseUrl } = opts
  return [
    '✅ Warehouse fulfillment completed',
    '',
    line('Order', `#${orderNumber}`),
    line('Case', caseTitle),
    line('Completed by', actorName),
  ]
    .filter(Boolean)
    .join('\n')
    .concat(`\n\nCase returned to CS for customer follow-up.\nOpen case: ${caseUrl}`)
}

export function commentToLarkPlain(commentText: string) {
  return commentTextToPlain(commentText)
}
