import { commentTextToPlain } from './comment-mentions'
import { statusMeta } from './incident-status'

export type OpenCaseSummaryItem = {
  id: string
  title: string
  order_number: string
  status: string
  warehouse_status: string | null
  category: string
  marketplace: string
  days_in_status: number
  pic_name: string
  latest_update: {
    author: string
    date: string
    text: string
  } | null
  case_url: string
}

const STATUS_EMAIL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  New: { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' },
  Investigating: { bg: '#fffbeb', text: '#92400e', border: '#fde68a' },
  'Waiting on Warehouse': { bg: '#fff7ed', text: '#9a3412', border: '#fed7aa' },
  'Waiting on Customer': { bg: '#faf5ff', text: '#6b21a8', border: '#e9d5ff' },
  'Waiting on Marketplace': { bg: '#ecfeff', text: '#155e75', border: '#a5f3fc' },
}

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function statusBadge(status: string) {
  const colors = STATUS_EMAIL_COLORS[status] ?? { bg: '#f1f5f9', text: '#334155', border: '#e2e8f0' }
  return `<span style="display: inline-block; background: ${colors.bg}; color: ${colors.text}; border: 1px solid ${colors.border}; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; white-space: nowrap;">${esc(status)}</span>`
}

function truncate(text: string, max = 220) {
  const plain = text.trim()
  if (plain.length <= max) return plain
  return `${plain.slice(0, max - 1)}…`
}

function formatStage(status: string, warehouseStatus: string | null) {
  const ws = warehouseStatus?.trim()
  if (ws && ws !== 'N/A') {
    return `${status} · Warehouse: ${ws}`
  }
  return status
}

function caseCard(item: OpenCaseSummaryItem) {
  const blocking = statusMeta(item.status).blockingParty
  const blockingNote = blocking
    ? `<p style="margin: 6px 0 0; font-size: 11px; color: #64748b;">Blocked by: <strong style="color: #475569;">${esc(blocking)}</strong></p>`
    : ''

  const update = item.latest_update
  const latestUpdateHtml = update
    ? `<div style="margin-top: 12px; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b;">Latest update</p>
        <p style="margin: 0 0 6px; font-size: 12px; color: #64748b;">${esc(update.author)} · ${esc(update.date)}</p>
        <p style="margin: 0; font-size: 13px; color: #334155; line-height: 1.45; white-space: pre-wrap;">${esc(truncate(update.text))}</p>
      </div>`
    : `<p style="margin: 12px 0 0; font-size: 12px; color: #94a3b8; font-style: italic;">No comments yet on this case.</p>`

  return `
    <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 18px; margin-bottom: 14px; background: #ffffff;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="vertical-align: top;">
            <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #64748b;">Order #${esc(item.order_number)}</p>
            <h3 style="margin: 0 0 8px; font-size: 15px; font-weight: 700; color: #0f172a; line-height: 1.35;">${esc(item.title)}</h3>
            <p style="margin: 0; font-size: 12px; color: #64748b;">${esc(item.category)} · ${esc(item.marketplace)} · PIC: ${esc(item.pic_name)}</p>
          </td>
          <td style="vertical-align: top; text-align: right; width: 140px;">
            ${statusBadge(item.status)}
            <p style="margin: 8px 0 0; font-size: 11px; color: #94a3b8;">${item.days_in_status} day${item.days_in_status === 1 ? '' : 's'} in status</p>
          </td>
        </tr>
      </table>
      <p style="margin: 10px 0 0; font-size: 12px; color: #475569;"><strong>Stage:</strong> ${esc(formatStage(item.status, item.warehouse_status))}</p>
      ${blockingNote}
      ${latestUpdateHtml}
      <p style="margin: 14px 0 0;">
        <a href="${esc(item.case_url)}" style="font-size: 12px; font-weight: 600; color: #2563eb; text-decoration: none;">Open case →</a>
      </p>
    </div>`
}

export function openCasesSummarySubject(openCount: number, dateLabel: string) {
  if (openCount === 0) return `Daily open cases summary — all clear (${dateLabel})`
  return `Daily open cases summary — ${openCount} active case${openCount === 1 ? '' : 's'} (${dateLabel})`
}

export function buildOpenCasesSummaryEmailHtml(opts: {
  recipientName: string
  aiSummaryHtml: string
  cases: OpenCaseSummaryItem[]
  reportDate: string
  appUrl: string
}) {
  const { recipientName, aiSummaryHtml, cases, reportDate, appUrl } = opts
  const openCount = cases.length

  const statusCounts = cases.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1
    return acc
  }, {})

  const statusPills = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => `${statusBadge(status)} <span style="font-size: 12px; color: #64748b; margin-right: 12px;">×${count}</span>`)
    .join(' ')

  const caseList = openCount > 0
    ? cases.map(caseCard).join('')
    : `<div style="text-align: center; padding: 32px 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px;">
        <p style="margin: 0; font-size: 18px; font-weight: 700; color: #166534;">All clear</p>
        <p style="margin: 8px 0 0; font-size: 14px; color: #15803d;">There are no open or unresolved cases right now. Great work!</p>
      </div>`

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #1e293b; line-height: 1.5;">
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); padding: 28px 32px; border-radius: 12px 12px 0 0;">
        <p style="margin: 0 0 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #94a3b8;">Daily briefing · ${esc(reportDate)} · GMT+7</p>
        <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">Open Cases Summary</h1>
        <p style="margin: 10px 0 0; font-size: 14px; color: #cbd5e1;">Hi ${esc(recipientName)}, here is your morning overview of all active incidents.</p>
      </div>
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 28px 32px;">
        <div style="display: flex; gap: 16px; margin-bottom: 24px;">
          <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 18px; text-align: center;">
            <p style="margin: 0; font-size: 28px; font-weight: 800; color: #0f172a;">${openCount}</p>
            <p style="margin: 4px 0 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">Open cases</p>
          </div>
        </div>

        ${openCount > 0 ? `<div style="margin-bottom: 20px;">${statusPills}</div>` : ''}

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px 20px; margin-bottom: 28px;">
          <p style="margin: 0 0 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">AI summary</p>
          <div style="font-size: 14px; color: #334155; line-height: 1.55;">${aiSummaryHtml}</div>
        </div>

        <h2 style="margin: 0 0 16px; font-size: 14px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.04em;">Case details</h2>
        ${caseList}

        <p style="margin: 28px 0 0; text-align: center;">
          <a href="${esc(appUrl)}" style="display: inline-block; background: #2563eb; color: #ffffff; font-weight: 600; font-size: 14px; text-decoration: none; padding: 12px 28px; border-radius: 8px;">Open Aeris CS Dashboard</a>
        </p>
        <p style="margin: 20px 0 0; font-size: 12px; color: #94a3b8; text-align: center;">Sent daily at 8:00 AM GMT+7 · Aeris CS Dashboard</p>
      </div>
    </div>
  `.trim()
}

export function buildLatestUpdate(
  comment: {
    comment_text: string
    created_at: string
    profiles: { full_name: string | null } | null
  } | null | undefined
) {
  if (!comment) return null
  const author = comment.profiles?.full_name?.trim() || 'Team member'
  const date = new Date(comment.created_at).toLocaleString('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return {
    author,
    date,
    text: commentTextToPlain(comment.comment_text),
  }
}
