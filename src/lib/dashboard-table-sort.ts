import { DASHBOARD_TABLE_EXTRA_KEYS } from './incident-status'

export const DASHBOARD_SORTABLE_COLUMNS = [
  'title',
  'order_number',
  'complaint_date',
  'category',
  'marketplace',
  'assigned_to',
  'status',
  'created_at',
  'action_taken',
  ...DASHBOARD_TABLE_EXTRA_KEYS,
] as const

export type DashboardSortColumn = (typeof DASHBOARD_SORTABLE_COLUMNS)[number]
export type SortDirection = 'asc' | 'desc'

type OrderableQuery = {
  order: (
    column: string,
    options?: { ascending?: boolean; foreignTable?: string; nullsFirst?: boolean }
  ) => OrderableQuery
}

export function applyIncidentSort<T>(
  query: T,
  column: DashboardSortColumn,
  direction: SortDirection
): T {
  const ascending = direction === 'asc'
  let q = query as OrderableQuery

  if (column === 'assigned_to') {
    q = q.order('full_name', { ascending, foreignTable: 'profiles', nullsFirst: ascending })
  } else {
    q = q.order(column, { ascending, nullsFirst: ascending })
  }

  if (column !== 'created_at') {
    q = q.order('created_at', { ascending: false })
  }

  return q as T
}

export function nextSortDirection(
  currentColumn: DashboardSortColumn,
  currentDirection: SortDirection,
  clickedColumn: DashboardSortColumn
): SortDirection {
  if (currentColumn !== clickedColumn) return 'asc'
  return currentDirection === 'asc' ? 'desc' : 'asc'
}
