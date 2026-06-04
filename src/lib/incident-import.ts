import {
  incidentExtraFields,
  extraFormToDbPayload,
  csvEscape,
  type ExtraFormState,
  type ExtraFieldKey,
} from './incident-extra-fields'
import { DEFAULT_STATUS, STATUS_VALUES, type IncidentStatus } from './incident-status'

export type ImportColumn = {
  key: string
  label: string
  required?: boolean
  /** Human-readable hint for the template example row */
  example?: string
}

/** Columns for bulk import (matches export labels; omits system-only fields). */
export const INCIDENT_IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'title', label: 'Title', required: true, example: 'Item arrived damaged — customer requests replacement' },
  { key: 'order_number', label: 'Order Number', required: true, example: 'ORD-12345' },
  { key: 'complaint_date', label: 'Date', required: true, example: '2026-06-04' },
  { key: 'category', label: 'Category', required: true, example: 'Damaged' },
  { key: 'marketplace', label: 'Marketplace', required: true, example: 'Shopee' },
  { key: 'assigned_pic_email', label: 'Assigned PIC Email', example: 'agent@company.com' },
  ...incidentExtraFields.map(f => ({
    key: f.key,
    label: f.label,
    example:
      ('placeholder' in f && f.placeholder) ||
      (f.type === 'select' && 'options' in f && f.options?.[1] ? String(f.options[1]) : ''),
  })),
  { key: 'status', label: 'Status', example: DEFAULT_STATUS },
]

const LABEL_TO_KEY = new Map<string, string>()
for (const col of INCIDENT_IMPORT_COLUMNS) {
  LABEL_TO_KEY.set(normalizeHeader(col.label), col.key)
}
// Form uses "Description" while export uses "Title"
LABEL_TO_KEY.set(normalizeHeader('Description'), 'title')
LABEL_TO_KEY.set(normalizeHeader('Title'), 'title')
LABEL_TO_KEY.set(normalizeHeader('Order #'), 'order_number')
LABEL_TO_KEY.set(normalizeHeader('Complaint Date'), 'complaint_date')
LABEL_TO_KEY.set(normalizeHeader('Assigned PIC'), 'assigned_pic_email')
LABEL_TO_KEY.set(normalizeHeader('Assigned PIC Email'), 'assigned_pic_email')

function normalizeHeader(h: string) {
  return h.replace(/\s*\(required\)\s*/gi, '').trim().toLowerCase()
}

export function getImportTemplateHeaders() {
  return INCIDENT_IMPORT_COLUMNS.map(c =>
    c.required ? `${c.label} (required)` : c.label
  )
}

/** Export uses the same field order as import (without “required” suffix), plus system columns. */
export function getExportHeaders() {
  return [
    ...INCIDENT_IMPORT_COLUMNS.map(c => c.label),
    'Draft Response',
    'Created At',
  ]
}

export function buildImportTemplateCsv() {
  const headers = getImportTemplateHeaders()
  const example = INCIDENT_IMPORT_COLUMNS.map(c => csvEscape(c.example ?? ''))
  return `\uFEFF${headers.join(',')}\n${example.join(',')}\n`
}

export type ParsedImportRow = {
  rowNumber: number
  title: string
  order_number: string
  complaint_date: string
  category: string
  marketplace: string
  assigned_pic_email: string
  status: string
  extra: ExtraFormState
}

export type ImportRowError = { rowNumber: number; message: string }

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

export function parseImportCsv(text: string): {
  rows: ParsedImportRow[]
  errors: ImportRowError[]
} {
  const cleaned = text.replace(/^\uFEFF/, '').trim()
  if (!cleaned) return { rows: [], errors: [{ rowNumber: 0, message: 'File is empty.' }] }

  const lines = cleaned.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length < 2) {
    return { rows: [], errors: [{ rowNumber: 0, message: 'Add at least one data row below the header row.' }] }
  }

  const headerCells = parseCsvLine(lines[0])
  const keyIndexes: (string | null)[] = headerCells.map(cell => {
    const key = LABEL_TO_KEY.get(normalizeHeader(cell))
    return key ?? null
  })

  if (!keyIndexes.includes('title') || !keyIndexes.includes('order_number') || !keyIndexes.includes('complaint_date')) {
    return {
      rows: [],
      errors: [{
        rowNumber: 0,
        message: 'Missing required columns. Use the import template (Title, Order Number, Date).',
      }],
    }
  }

  const rows: ParsedImportRow[] = []
  const errors: ImportRowError[] = []

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1
    const cells = parseCsvLine(lines[i])
    const record: Record<string, string> = {}
    keyIndexes.forEach((key, idx) => {
      if (key) record[key] = (cells[idx] ?? '').trim()
    })

    // Skip template example row if unchanged
    if (isExampleTemplateRow(record)) continue

    const title = record.title ?? ''
    const order_number = record.order_number ?? ''
    const complaint_date = normalizeDate(record.complaint_date ?? '')
    const category = record.category ?? ''
    const marketplace = record.marketplace ?? ''

    if (!title || !order_number || !complaint_date) {
      errors.push({
        rowNumber,
        message: 'Title, Order Number, and Date are required.',
      })
      continue
    }
    if (!complaint_date) {
      errors.push({ rowNumber, message: 'Date must be YYYY-MM-DD (e.g. 2026-06-04).' })
      continue
    }
    if (!category || !marketplace) {
      errors.push({ rowNumber, message: 'Category and Marketplace are required.' })
      continue
    }

    const statusRaw = (record.status ?? '').trim()
    const status = statusRaw === '' ? DEFAULT_STATUS : statusRaw
    if (!STATUS_VALUES.includes(status as IncidentStatus)) {
      errors.push({
        rowNumber,
        message: `Invalid status "${statusRaw}". Use: ${STATUS_VALUES.join(', ')}`,
      })
      continue
    }

    const extra = {} as ExtraFormState
    for (const field of incidentExtraFields) {
      const key = field.key as ExtraFieldKey
      extra[key] = record[key] ?? ''
      if (field.type === 'select' && extra[key]) {
        const allowed = field.options?.filter(o => o !== '') ?? []
        if (allowed.length && !allowed.includes(extra[key] as (typeof allowed)[number])) {
          errors.push({
            rowNumber,
            message: `Invalid ${field.label}: "${extra[key]}". Allowed: ${allowed.join(', ')}`,
          })
        }
      }
    }

    if (errors.some(e => e.rowNumber === rowNumber)) continue

    rows.push({
      rowNumber,
      title,
      order_number,
      complaint_date,
      category,
      marketplace,
      assigned_pic_email: record.assigned_pic_email ?? '',
      status,
      extra,
    })
  }

  return { rows, errors }
}

function isExampleTemplateRow(record: Record<string, string>) {
  const exampleOrder = INCIDENT_IMPORT_COLUMNS.find(c => c.key === 'order_number')?.example
  return exampleOrder && record.order_number === exampleOrder
}

function normalizeDate(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) {
    const [, d, m, y] = slash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0]
  }
  return ''
}

export type AgentLookup = { id: string; email: string }

export function importRowToInsertPayload(
  row: ParsedImportRow,
  agents: AgentLookup[],
  assignedByUserId: string | null,
  userRole: string
) {
  const agent = row.assigned_pic_email
    ? agents.find(a => a.email.toLowerCase() === row.assigned_pic_email.toLowerCase())
    : null

  let assigned_to: string | null = null
  if (userRole !== 'warehouse') {
    if (agent) assigned_to = agent.id
    else if (!row.assigned_pic_email && assignedByUserId) assigned_to = assignedByUserId
  }

  const now = new Date().toISOString()
  return {
    title: row.title,
    order_number: row.order_number,
    complaint_date: row.complaint_date,
    category: row.category,
    marketplace: row.marketplace,
    status: row.status,
    status_changed_at: now,
    assigned_to,
    ...extraFormToDbPayload(row.extra),
  }
}

/** Reference sheet text for Excel users (paste into a second sheet or readme). */
export function getImportFieldGuide() {
  const statusLine = `Status (optional, default ${DEFAULT_STATUS}): ${STATUS_VALUES.join(' | ')}`
  const selectFields = incidentExtraFields
    .filter(f => f.type === 'select')
    .map(f => `${f.label}: ${(f.options ?? []).filter(Boolean).join(' | ')}`)
  return [
    'Required: Title, Order Number, Date (YYYY-MM-DD), Category, Marketplace.',
    'Category and Marketplace must match names in Manage lists.',
    statusLine,
    ...selectFields,
    'Money columns: numbers only (no currency symbols).',
    'Delete the example row before importing your cases.',
  ]
}
