import { WAITING_ON_WAREHOUSE } from './incident-status'

export type IncidentListFilters = {
  from?: string
  to?: string
  cat?: string
  mp?: string
  stat?: string
  queue?: '' | 'mine' | 'warehouse'
  search?: string
  userId?: string
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
  if (f.queue === 'mine' && f.userId) q = q.eq('assigned_to', f.userId)
  if (f.queue === 'warehouse') q = q.eq('status', WAITING_ON_WAREHOUSE)
  const searchClause = f.search ? incidentSearchOrClause(f.search) : null
  if (searchClause) q = q.or(searchClause)
  return q as T
}
