import { formatDateOnly } from './incident-extra-fields'

export type CsNotifyIncident = {
  id: string
  title: string
  order_number: string
  complaint_date: string | null
  category: string
  marketplace: string
  status: string
  customer_address?: string | null
  province?: string | null
  bpb_number?: string | null
  action_taken?: string | null
  delivery_deadline?: string | null
  courier?: string | null
  shipping_label?: string | null
  notes?: string | null
  warehouse_status?: string | null
}

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function row(label: string, value: string | null | undefined) {
  if (!value?.trim()) return ''
  return `
    <tr>
      <td style="padding: 8px 12px; color: #64748b; font-size: 13px; width: 140px; vertical-align: top; border-bottom: 1px solid #f1f5f9;">${esc(label)}</td>
      <td style="padding: 8px 12px; color: #0f172a; font-size: 14px; border-bottom: 1px solid #f1f5f9; white-space: pre-wrap;">${esc(value.trim())}</td>
    </tr>`
}

export function buildCsNotifyEmailHtml(opts: {
  incident: CsNotifyIncident
  message: string
  senderName: string
  caseUrl: string
  templateLabel?: string
}) {
  const { incident, message, senderName, caseUrl, templateLabel } = opts
  const rows = [
    row('Order #', incident.order_number),
    row('Complaint date', incident.complaint_date ? formatDateOnly(incident.complaint_date) : null),
    row('Category', incident.category),
    row('Marketplace', incident.marketplace),
    row('Status', incident.status),
    row('Warehouse status', incident.warehouse_status ?? undefined),
    row('BPB #', incident.bpb_number ?? undefined),
    row('Action', incident.action_taken ?? undefined),
    row('Delivery deadline', incident.delivery_deadline ? formatDateOnly(incident.delivery_deadline) : null),
    row('Province', incident.province ?? undefined),
    row('Address', incident.customer_address ?? undefined),
    row('Courier', incident.courier ?? undefined),
    row('Shipping label', incident.shipping_label ?? undefined),
    row('Notes', incident.notes ?? undefined),
  ].join('')

  const templateBadge = templateLabel
    ? `<p style="margin: 0 0 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #1d4ed8;">Template: ${esc(templateLabel)}</p>`
    : ''

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1e293b; line-height: 1.5;">
      <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 24px 28px; border-radius: 12px 12px 0 0;">
        <p style="margin: 0 0 6px; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #dbeafe;">Update from warehouse</p>
        <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; line-height: 1.35;">${esc(incident.title)}</h1>
      </div>
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 24px 28px;">
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 16px 18px; margin-bottom: 24px;">
          ${templateBadge}
          <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #1e40af;">Message from ${esc(senderName)}</p>
          <p style="margin: 0; font-size: 15px; color: #1e3a8a; white-space: pre-wrap;">${esc(message)}</p>
        </div>
        <h2 style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #334155;">Case details</h2>
        <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
          ${rows}
        </table>
        <p style="margin: 28px 0 0; text-align: center;">
          <a href="${esc(caseUrl)}" style="display: inline-block; background: #2563eb; color: #ffffff; font-weight: 600; font-size: 14px; text-decoration: none; padding: 12px 28px; border-radius: 8px;">Open case in Incident Tracker</a>
        </p>
        <p style="margin: 20px 0 0; font-size: 12px; color: #94a3b8; text-align: center;">Sent by ${esc(senderName)} · Incident Tracker</p>
      </div>
    </div>
  `.trim()
}

export function csNotifySubject(orderNumber: string, templateId?: string) {
  if (templateId === 'request_completed') {
    return `Warehouse request completed — Order #${orderNumber}`
  }
  return `Warehouse update — Order #${orderNumber}`
}
