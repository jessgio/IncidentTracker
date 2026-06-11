import { WAITING_ON_WAREHOUSE } from './incident-status'

const CLOSED_STATUS_IN = '("Resolved","Closed")'

export type MetricFilter =
  | { kind: 'sla' }
  | { kind: 'open' }
  | { kind: 'closed' }
  | { kind: 'financial' }
  | { kind: 'aging'; bucket: '0_1' | '1_3' | '3_plus' }
  | { kind: 'opened_this_week' }
  | { kind: 'resolved_this_week' }
  | { kind: 'first_response' }
  | { kind: 'warehouse_cycle' }
  | { kind: 'has_resolution' }
  | { kind: 'assigned_to'; picId: string | null }

export const BLOCKED_PARTY_STATUS: Record<'Warehouse' | 'Customer' | 'Marketplace', string> = {
  Warehouse: 'Waiting on Warehouse',
  Customer: 'Waiting on Customer',
  Marketplace: 'Waiting on Marketplace',
}

export type IncidentListFilters = {
  from?: string
  to?: string
  cat?: string
  mp?: string
  stat?: string
  fault?: string
  queue?: '' | 'mine' | 'warehouse'
  search?: string
  userId?: string
  metric?: MetricFilter | null
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

/** PostgREST filter for open cases aged by last status change (matches dashboard RPC). */
function staleSinceFilter(iso: string, op: 'lt' | 'gte') {
  return `status_changed_at.${op}.${iso},and(status_changed_at.is.null,created_at.${op}.${iso})`
}

function staleBetweenFilter(newerThanIso: string, olderThanIso: string) {
  return [
    `and(status_changed_at.lt.${newerThanIso},status_changed_at.gte.${olderThanIso})`,
    `and(status_changed_at.is.null,created_at.lt.${newerThanIso},created_at.gte.${olderThanIso})`,
  ].join(',')
}

export function applyMetricFilter<T>(query: T, metric: MetricFilter | null | undefined): T {
  if (!metric) return query

  let q = query as Record<string, (...args: unknown[]) => typeof q> & typeof query

  switch (metric.kind) {
    case 'sla':
      q = q.not('status', 'in', CLOSED_STATUS_IN)
      q = q.or(staleSinceFilter(daysAgoIso(3), 'lt'))
      break
    case 'open':
      q = q.not('status', 'in', CLOSED_STATUS_IN)
      break
    case 'closed':
      q = q.in('status', ['Resolved', 'Closed'])
      break
    case 'financial':
      q = q.or('refund_amount.gt.0,replacement_fee.gt.0,shipping_fee.gt.0')
      break
    case 'aging':
      q = q.not('status', 'in', CLOSED_STATUS_IN)
      if (metric.bucket === '0_1') {
        q = q.or(staleSinceFilter(daysAgoIso(1), 'gte'))
      } else if (metric.bucket === '1_3') {
        q = q.or(staleBetweenFilter(daysAgoIso(1), daysAgoIso(3)))
      } else {
        q = q.or(staleSinceFilter(daysAgoIso(3), 'lt'))
      }
      break
    case 'opened_this_week':
      q = q.gte('created_at', daysAgoIso(7))
      break
    case 'resolved_this_week':
      q = q.gte('resolved_at', daysAgoIso(7))
      break
    case 'first_response':
      q = q.or('status_changed_at.gt.created_at,and(status_changed_at.is.null,updated_at.gt.created_at)')
      break
    case 'warehouse_cycle':
      q = q.not('warehouse_requested_at', 'is', null)
      q = q.not('warehouse_completed_at', 'is', null)
      break
    case 'has_resolution':
      q = q.not('resolved_at', 'is', null)
      break
    case 'assigned_to':
      q = q.not('status', 'in', CLOSED_STATUS_IN)
      if (metric.picId) q = q.eq('assigned_to', metric.picId)
      else q = q.is('assigned_to', null)
      break
  }

  return q as T
}

/** Strip wildcards so user input cannot broaden an ilike pattern. */
export function sanitizeSearchTerm(term: string) {
  return term.trim().replace(/%/g, '')
}

/** PostgREST `.or()` filter matching text across core incident fields. */
export function incidentSearchOrClause(term: string) {
  const t = sanitizeSearchTerm(term)
  if (!t) return null
  const pattern = `%${t}%`
  return [
    `title.ilike.${pattern}`,
    `order_number.ilike.${pattern}`,
    `category.ilike.${pattern}`,
    `marketplace.ilike.${pattern}`,
    `status.ilike.${pattern}`,
  ].join(',')
}

export function applyIncidentListFilters<T>(query: T, f: IncidentListFilters): T {
  let q = query as {
    gte: (col: string, v: string) => typeof q
    lte: (col: string, v: string) => typeof q
    eq: (col: string, v: string) => typeof q
    or: (clause: string) => typeof q
  }
  if (f.from) q = q.gte('complaint_date', f.from)
  if (f.to) q = q.lte('complaint_date', f.to)
  if (f.cat) q = q.eq('category', f.cat)
  if (f.mp) q = q.eq('marketplace', f.mp)
  if (f.stat) q = q.eq('status', f.stat)
  if (f.fault) q = q.eq('fault_party', f.fault)
  if (f.queue === 'mine' && f.userId) q = q.eq('assigned_to', f.userId)
  if (f.queue === 'warehouse') q = q.eq('status', WAITING_ON_WAREHOUSE)
  const searchClause = f.search ? incidentSearchOrClause(f.search) : null
  if (searchClause) q = q.or(searchClause)
  return applyMetricFilter(q, f.metric) as T
}
