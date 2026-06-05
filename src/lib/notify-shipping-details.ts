export type NotifyShippingFields = {
  bpb_number?: string | null
  customer_address?: string | null
  courier?: string | null
  shipping_label?: string | null
}

const SHIPPING_DETAIL_LINES: { key: keyof NotifyShippingFields; label: string }[] = [
  { key: 'bpb_number', label: 'BPB #' },
  { key: 'customer_address', label: 'Address' },
  { key: 'courier', label: 'Courier' },
  { key: 'shipping_label', label: 'Shipping label' },
]

export function formatNotifyShippingDetails(fields: NotifyShippingFields): string {
  const lines = SHIPPING_DETAIL_LINES.map(({ key, label }) => {
    const value = fields[key]?.trim()
    return value ? `${label}: ${value}` : null
  }).filter((line): line is string => line !== null)

  if (lines.length === 0) return ''
  return `\n\n${lines.join('\n')}`
}

export function appendNotifyShippingDetails(message: string, fields: NotifyShippingFields): string {
  const block = formatNotifyShippingDetails(fields)
  if (!block) return message

  const trimmed = message.trimEnd()
  const blockLines = block.trim().split('\n')
  if (blockLines.every(line => trimmed.includes(line))) return message

  return trimmed + block
}
