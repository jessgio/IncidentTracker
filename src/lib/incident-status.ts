// Single source of truth for the incident status lifecycle and the color/style
// maps that were previously duplicated across DashboardClient, CommentThread and
// ManageListsModal.

export type BlockingParty = 'warehouse' | 'customer' | 'marketplace' | null

export type IncidentStatus =
  | 'New'
  | 'Investigating'
  | 'Waiting on Warehouse'
  | 'Waiting on Customer'
  | 'Waiting on Marketplace'
  | 'Resolved'
  | 'Closed'

export type StatusMeta = {
  value: IncidentStatus
  isOpen: boolean
  blockingParty: BlockingParty
  badge: string // pill in tables / detail header
  select: string // colored <select> control
  dot: string // small status dot
  solid: string // solid bar (charts)
}

// NOTE: class strings are written out in full (no interpolation) so Tailwind's
// scanner picks them up.
export const INCIDENT_STATUSES: StatusMeta[] = [
  { value: 'New', isOpen: true, blockingParty: null, badge: 'bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-300', select: 'bg-blue-50 text-blue-800 border-blue-300', dot: 'bg-blue-500', solid: 'bg-blue-500' },
  { value: 'Investigating', isOpen: true, blockingParty: null, badge: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-300', select: 'bg-amber-50 text-amber-800 border-amber-300', dot: 'bg-amber-500', solid: 'bg-amber-500' },
  { value: 'Waiting on Warehouse', isOpen: true, blockingParty: 'warehouse', badge: 'bg-orange-50 text-orange-800 ring-1 ring-inset ring-orange-300', select: 'bg-orange-50 text-orange-800 border-orange-300', dot: 'bg-orange-500', solid: 'bg-orange-500' },
  { value: 'Waiting on Customer', isOpen: true, blockingParty: 'customer', badge: 'bg-purple-50 text-purple-800 ring-1 ring-inset ring-purple-300', select: 'bg-purple-50 text-purple-800 border-purple-300', dot: 'bg-purple-500', solid: 'bg-purple-500' },
  { value: 'Waiting on Marketplace', isOpen: true, blockingParty: 'marketplace', badge: 'bg-cyan-50 text-cyan-800 ring-1 ring-inset ring-cyan-300', select: 'bg-cyan-50 text-cyan-800 border-cyan-300', dot: 'bg-cyan-500', solid: 'bg-cyan-500' },
  { value: 'Resolved', isOpen: false, blockingParty: null, badge: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-300', select: 'bg-emerald-50 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500', solid: 'bg-emerald-500' },
  { value: 'Closed', isOpen: false, blockingParty: null, badge: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300', select: 'bg-slate-100 text-slate-700 border-slate-300', dot: 'bg-slate-500', solid: 'bg-slate-500' },
]

export const STATUS_VALUES = INCIDENT_STATUSES.map(s => s.value)
export const DEFAULT_STATUS: IncidentStatus = 'New'
export const WAITING_ON_WAREHOUSE: IncidentStatus = 'Waiting on Warehouse'

const FALLBACK_META: StatusMeta = INCIDENT_STATUSES[0]

export function statusMeta(status: string | null | undefined): StatusMeta {
  return INCIDENT_STATUSES.find(s => s.value === status) ?? FALLBACK_META
}

export function isOpenStatus(status: string | null | undefined): boolean {
  return statusMeta(status).isOpen
}

// Computes the timestamp side-effects of a status transition. Pass the incident's
// previous resolved_at so closing an already-resolved case keeps its resolution time.
export type UserRole = 'cs' | 'warehouse' | 'manager'

export function canDeleteIncidents(role: UserRole | string | null | undefined): boolean {
  return role === 'manager'
}

export function statusChangePatch(
  newStatus: string,
  prev?: { resolved_at?: string | null; warehouse_status?: string | null }
): Record<string, string | null> {
  const now = new Date().toISOString()
  const patch: Record<string, string | null> = {
    status: newStatus,
    status_changed_at: now,
    updated_at: now,
  }

  if (newStatus === 'Resolved') {
    patch.resolved_at = now
  } else if (newStatus === 'Closed') {
    patch.resolved_at = prev?.resolved_at ?? now
  } else {
    // Reopened into an active state: clear the resolution time.
    patch.resolved_at = null
  }

  if (newStatus === 'Waiting on Warehouse') {
    patch.warehouse_requested_at = now
    const ws = prev?.warehouse_status?.trim()
    if (!ws || ws === 'N/A') {
      patch.warehouse_status = 'Requested'
    }
  }

  return patch
}

// Extra fields shown in the dashboard table (detail view still shows all).
export const DASHBOARD_TABLE_EXTRA_KEYS = [
  'warehouse_status',
  'shipping_label',
  'fault_party',
  'action_taken',
  'bpb_number',
  'delivery_deadline',
] as const

export const SLA_DAYS = 3

export function formatIdr(amount: number | null | undefined) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(amount ?? 0))
}

export function trendLabel(thisWeek: number, lastWeek: number) {
  if (lastWeek === 0) return thisWeek > 0 ? 'new this week' : 'no change'
  const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
  if (pct === 0) return 'same as last week'
  return pct > 0 ? `↑ ${pct}% vs last week` : `↓ ${Math.abs(pct)}% vs last week`
}

// ---- Category colors (shared) ----------------------------------------------
export const categoryColorMap: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-800 ring-blue-300',
  purple: 'bg-purple-50 text-purple-800 ring-purple-300',
  rose: 'bg-rose-50 text-rose-800 ring-rose-300',
  slate: 'bg-slate-100 text-slate-800 ring-slate-300',
  amber: 'bg-amber-50 text-amber-800 ring-amber-300',
  emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  cyan: 'bg-cyan-50 text-cyan-800 ring-cyan-300',
  pink: 'bg-pink-50 text-pink-800 ring-pink-300',
  indigo: 'bg-indigo-50 text-indigo-800 ring-indigo-300',
  orange: 'bg-orange-50 text-orange-800 ring-orange-300',
}

export const categorySolidColorMap: Record<string, string> = {
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  rose: 'bg-rose-500',
  slate: 'bg-slate-600',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  cyan: 'bg-cyan-500',
  pink: 'bg-pink-500',
  indigo: 'bg-indigo-500',
  orange: 'bg-orange-500',
}

export const CATEGORY_COLOR_OPTIONS = Object.keys(categoryColorMap)

export function categoryRingStyle(color: string | null | undefined): string {
  return categoryColorMap[color || 'slate'] || categoryColorMap.slate
}

export function categorySolidStyle(color: string | null | undefined): string {
  return categorySolidColorMap[color || 'slate'] || categorySolidColorMap.slate
}
