import { formatDateOnly } from './incident-extra-fields'

export type WarehouseNotifyIncident = {
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

export function buildWarehouseNotifyEmailHtml(opts: {
  incident: WarehouseNotifyIncident
  message: string
  senderName: string
  caseUrl: string
}) {
  const { incident, message, senderName, caseUrl } = opts
  const rows = [
    row('Order #', incident.order_number),
    row('Complaint date', incident.complaint_date ? formatDateOnly(incident.complaint_date) : null),
    row('Category', incident.category),
    row('Marketplace', incident.marketplace),
    row('Status', incident.status),
    row('Warehouse status', incident.warehouse_status ?? undefined),
    row('BPB #', incident.bpb_number ?? undefined),
    row('Action requested', incident.action_taken ?? undefined),
    row('Delivery deadline', incident.delivery_deadline ? formatDateOnly(incident.delivery_deadline) : null),
    row('Province', incident.province ?? undefined),
    row('Address', incident.customer_address ?? undefined),
    row('Courier', incident.courier ?? undefined),
    row('Shipping label', incident.shipping_label ?? undefined),
    row('Notes', incident.notes ?? undefined),
  ].join('')

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1e293b; line-height: 1.5;">
      <div style="background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); padding: 24px 28px; border-radius: 12px 12px 0 0;">
        <p style="margin: 0 0 6px; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #ffedd5;">Warehouse action requested</p>
        <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; line-height: 1.35;">${esc(incident.title)}</h1>
      </div>
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 24px 28px;">
        <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 16px 18px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #9a3412;">Message from ${esc(senderName)}</p>
          <p style="margin: 0; font-size: 15px; color: #431407; white-space: pre-wrap;">${esc(message)}</p>
        </div>
        <h2 style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #334155;">Case details</h2>
        <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
          ${rows}
        </table>
        <p style="margin: 28px 0 0; text-align: center;">
          <a href="${esc(caseUrl)}" style="display: inline-block; background: #ea580c; color: #ffffff; font-weight: 600; font-size: 14px; text-decoration: none; padding: 12px 28px; border-radius: 8px;">Open case in Aeris CS Dashboard</a>
        </p>
        <p style="margin: 20px 0 0; font-size: 12px; color: #94a3b8; text-align: center;">Sent by ${esc(senderName)} · Aeris CS Dashboard</p>
      </div>
    </div>
  `.trim()
}

export function warehouseNotifySubject(orderNumber: string) {
  return `Warehouse action requested — Order #${orderNumber}`
}
