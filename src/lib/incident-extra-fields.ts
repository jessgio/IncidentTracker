export type ExtraFieldType = 'text' | 'textarea' | 'date' | 'money' | 'select'

export const incidentExtraFields = [
  {
    key: 'bpb_number',
    label: 'BPB #',
    type: 'text',
    placeholder: 'BPB-12345',
    tableClass: 'min-w-[140px] whitespace-nowrap',
  },
  {
    key: 'customer_address',
    label: 'Address',
    type: 'textarea',
    placeholder: 'Customer address',
    tableClass: 'min-w-[260px]',
  },
  {
    key: 'appeal_status',
    label: 'Appeal',
    type: 'select',
    options: ['', 'Not Appealed', 'Pending', 'Approved', 'Rejected'],
    tableClass: 'min-w-[140px] whitespace-nowrap',
  },
  {
    key: 'delivery_deadline',
    label: 'Delivery Deadline',
    type: 'date',
    tableClass: 'min-w-[160px] whitespace-nowrap',
  },
  {
    key: 'action_taken',
    label: 'Action',
    type: 'text',
    placeholder: 'Replacement / Refund / Voucher / Other',
    tableClass: 'min-w-[220px]',
  },
  {
    key: 'notes',
    label: 'Notes',
    type: 'textarea',
    placeholder: 'Internal notes',
    tableClass: 'min-w-[280px]',
  },
  {
    key: 'issue_number',
    label: 'Issue #',
    type: 'text',
    placeholder: 'Marketplace issue number',
    tableClass: 'min-w-[160px] whitespace-nowrap',
  },
  {
    key: 'conclusion',
    label: 'Conclusion',
    type: 'textarea',
    placeholder: 'Final resolution',
    tableClass: 'min-w-[280px]',
  },
  {
    key: 'fault_party',
    label: 'Fault',
    type: 'select',
    options: ['', 'Brand', 'Warehouse', 'Courier', 'Marketplace', 'Customer', 'Unknown'],
    tableClass: 'min-w-[140px] whitespace-nowrap',
  },
  {
    key: 'warehouse_status',
    label: 'Warehouse Status',
    type: 'select',
    options: ['', 'N/A', 'Not Started', 'Requested', 'Preparing', 'Shipped', 'Completed', 'Blocked'],
    tableClass: 'min-w-[180px] whitespace-nowrap',
  },
  {
    key: 'shipping_fee',
    label: 'Shipping Fee',
    type: 'money',
    placeholder: '0',
    tableClass: 'min-w-[140px] whitespace-nowrap text-right',
  },
  {
    key: 'replacement_fee',
    label: 'Replacement Fee',
    type: 'money',
    placeholder: '0',
    tableClass: 'min-w-[160px] whitespace-nowrap text-right',
  },
  {
    key: 'refund_amount',
    label: 'Refund',
    type: 'money',
    placeholder: '0',
    tableClass: 'min-w-[140px] whitespace-nowrap text-right',
  },
  {
    key: 'payment_method',
    label: 'Payment Method',
    type: 'text',
    placeholder: 'Credit card / COD / Wallet / Transfer',
    tableClass: 'min-w-[180px] whitespace-nowrap',
  },
  {
    key: 'courier',
    label: 'Courier',
    type: 'text',
    placeholder: 'JNE / J&T / SiCepat / DHL / etc.',
    tableClass: 'min-w-[140px] whitespace-nowrap',
  },
] as const satisfies readonly {
  key: string
  label: string
  type: ExtraFieldType
  placeholder?: string
  options?: readonly string[]
  tableClass?: string
}[]

export type ExtraFieldKey = typeof incidentExtraFields[number]['key']
export type MoneyFieldKey = Extract<
  ExtraFieldKey,
  'shipping_fee' | 'replacement_fee' | 'refund_amount'
>

export type ExtraFormState = Record<ExtraFieldKey, string>

export type IncidentExtraDbFields = {
  [K in ExtraFieldKey]: K extends MoneyFieldKey ? number | null : string | null
}

export const emptyExtraFormState = incidentExtraFields.reduce((acc, field) => {
  acc[field.key as ExtraFieldKey] = ''
  return acc
}, {} as ExtraFormState)

export function extraFormToDbPayload(form: ExtraFormState): IncidentExtraDbFields {
  const payload: Record<string, string | number | null> = {}

  for (const field of incidentExtraFields) {
    const key = field.key as ExtraFieldKey
    const raw = (form[key] ?? '').trim()

    if (field.type === 'money') {
      if (raw === '') {
        payload[key] = null
      } else {
        const parsed = Number(raw)
        payload[key] = Number.isFinite(parsed) ? parsed : null
      }
    } else {
      payload[key] = raw === '' ? null : raw
    }
  }

  return payload as IncidentExtraDbFields
}

export function incidentToExtraForm(
  incident: Partial<IncidentExtraDbFields>
): ExtraFormState {
  const form = { ...emptyExtraFormState }

  for (const field of incidentExtraFields) {
    const key = field.key as ExtraFieldKey
    const value = incident[key as keyof IncidentExtraDbFields]
    form[key] = value === null || value === undefined ? '' : String(value)
  }

  return form
}

export function formatExtraValue(
  value: string | number | null | undefined,
  type: ExtraFieldType
) {
  if (value === null || value === undefined || value === '') return '—'

  if (type === 'money') {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(Number(value))
  }

  if (type === 'date') {
    return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return String(value)
}

export function csvEscape(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

// Date-only columns (e.g. complaint_date) are stored as `YYYY-MM-DD`. Passing that
// straight to `new Date()` parses it as UTC midnight, which renders the previous day
// in negative-offset timezones. Anchoring to local midnight avoids the off-by-one.
export function formatDateOnly(
  value: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', opts)
}