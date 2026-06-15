import type { SupabaseClient } from '@supabase/supabase-js'
import { STATUS_VALUES, WAITING_ON_WAREHOUSE } from './incident-status'
import { applyIncidentListFilters, type IncidentListFilters } from './incident-list-filters'

const OPEN_STATUSES = STATUS_VALUES.filter(s => s !== 'Resolved' && s !== 'Closed')
const CLOSED_STATUSES = ['Resolved', 'Closed'] as const

export type ChartRow = { name: string; count: number; percentage?: number }

export type FinancialRow = { name: string; amount: number; percentage?: number }

export type PicWorkload = {
  pic_id: string | null
  pic_name: string
  total_active: number
  by_status: ChartRow[]
}

export type DashboardTrend = {
  this_week: number
  last_week: number
  this_week_resolved: number
  last_week_resolved: number
}

export type DashboardStats = {
  total_all: number
  total_open: number
  waiting_on_warehouse: number
  sla_breaches: number
  avg_resolution_hours: number | null
  avg_first_response_hours: number | null
  first_response_count: number
  avg_warehouse_cycle_hours: number | null
  warehouse_cycle_count: number
  financial_impact: number
  my_queue: number
  by_status: ChartRow[]
  aging: { d0_1: number; d1_3: number; d3_plus: number }
  by_category: ChartRow[]
  by_marketplace: ChartRow[]
  by_fault: ChartRow[]
  by_fault_financial: FinancialRow[]
  by_pic: PicWorkload[]
  trend: DashboardTrend
}

export const EMPTY_STATS: DashboardStats = {
  total_all: 0,
  total_open: 0,
  waiting_on_warehouse: 0,
  sla_breaches: 0,
  avg_resolution_hours: null,
  avg_first_response_hours: null,
  first_response_count: 0,
  avg_warehouse_cycle_hours: null,
  warehouse_cycle_count: 0,
  financial_impact: 0,
  my_queue: 0,
  by_status: [],
  aging: { d0_1: 0, d1_3: 0, d3_plus: 0 },
  by_category: [],
  by_marketplace: [],
  by_fault: [],
  by_fault_financial: [],
  by_pic: [],
  trend: { this_week: 0, last_week: 0, this_week_resolved: 0, last_week_resolved: 0 },
}

/** Human-readable duration from hours (RPC returns hours). */
export function formatHours(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(hours)) return '—'
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 48) return `${hours.toFixed(1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

function statusCounts(byStatus: ChartRow[], names: readonly string[]): ChartRow[] {
  const byName = Object.fromEntries(byStatus.map(r => [r.name, r.count]))
  return names.map(name => ({ name, count: byName[name] ?? 0 }))
}

/** Open-case counts per status, in lifecycle order (excludes Resolved / Closed). */
export function openStatusBreakdown(byStatus: ChartRow[]): ChartRow[] {
  return statusCounts(byStatus, OPEN_STATUSES)
}

/** Resolved and closed counts (still within current dashboard filters). */
export function closedStatusBreakdown(byStatus: ChartRow[]): ChartRow[] {
  return statusCounts(byStatus, CLOSED_STATUSES)
}

export function weeklyFlowLabel(opened: number, resolved: number): string {
  const net = resolved - opened
  if (net > 0) return `Backlog down ${net} — resolving faster than new intake`
  if (net < 0) return `Backlog up ${Math.abs(net)} — intake outpacing resolution`
  return 'Intake and resolution balanced this week'
}

function withPercentages(rows: ChartRow[], total: number): ChartRow[] {
  return rows
    .filter(r => r.count > 0)
    .map(r => ({ ...r, percentage: Math.round((r.count / (total || 1)) * 100) }))
}

function withFinancialPercentages(rows: FinancialRow[], total: number): FinancialRow[] {
  return rows
    .filter(r => r.amount > 0)
    .map(r => ({ ...r, percentage: Math.round((r.amount / (total || 1)) * 100) }))
}

export function parseDashboardStats(raw: unknown, totalForPct = 0): DashboardStats {
  if (!raw || typeof raw !== 'object') return EMPTY_STATS
  const d = raw as Record<string, unknown>
  const total = Number(d.total_all ?? 0)

  const rows = (key: string): ChartRow[] =>
    Array.isArray(d[key])
      ? (d[key] as { name: string; count: number }[]).map(r => ({
          name: String(r.name),
          count: Number(r.count),
        }))
      : []

  return {
    total_all: total,
    total_open: Number(d.total_open ?? 0),
    waiting_on_warehouse: Number(d.waiting_on_warehouse ?? 0),
    sla_breaches: Number(d.sla_breaches ?? 0),
    avg_resolution_hours: d.avg_resolution_hours != null ? Number(d.avg_resolution_hours) : null,
    avg_first_response_hours: d.avg_first_response_hours != null ? Number(d.avg_first_response_hours) : null,
    first_response_count: Number(d.first_response_count ?? 0),
    avg_warehouse_cycle_hours: d.avg_warehouse_cycle_hours != null ? Number(d.avg_warehouse_cycle_hours) : null,
    warehouse_cycle_count: Number(d.warehouse_cycle_count ?? 0),
    financial_impact: Number(d.financial_impact ?? 0),
    my_queue: Number(d.my_queue ?? 0),
    by_status: rows('by_status'),
    aging: {
      d0_1: Number((d.aging as Record<string, number> | undefined)?.d0_1 ?? 0),
      d1_3: Number((d.aging as Record<string, number> | undefined)?.d1_3 ?? 0),
      d3_plus: Number((d.aging as Record<string, number> | undefined)?.d3_plus ?? 0),
    },
    by_category: withPercentages(rows('by_category'), totalForPct || total),
    by_marketplace: withPercentages(rows('by_marketplace'), totalForPct || total),
    by_fault: withPercentages(rows('by_fault'), totalForPct || total),
    by_fault_financial: withFinancialPercentages(
      Array.isArray(d.by_fault_financial)
        ? (d.by_fault_financial as { name: string; amount: number }[]).map(r => ({
            name: String(r.name),
            amount: Number(r.amount),
          }))
        : [],
      Number(d.financial_impact ?? 0)
    ),
    by_pic: Array.isArray(d.by_pic)
      ? (d.by_pic as Record<string, unknown>[]).map(row => ({
          pic_id: row.pic_id != null && row.pic_id !== '' ? String(row.pic_id) : null,
          pic_name: String(row.pic_name ?? 'Unassigned'),
          total_active: Number(row.total_active ?? 0),
          by_status: Array.isArray(row.by_status)
            ? (row.by_status as { name: string; count: number }[]).map(s => ({
                name: String(s.name),
                count: Number(s.count),
              }))
            : [],
        }))
      : [],
    trend: {
      this_week: Number((d.trend as Record<string, number> | undefined)?.this_week ?? 0),
      last_week: Number((d.trend as Record<string, number> | undefined)?.last_week ?? 0),
      this_week_resolved: Number((d.trend as Record<string, number> | undefined)?.this_week_resolved ?? 0),
      last_week_resolved: Number((d.trend as Record<string, number> | undefined)?.last_week_resolved ?? 0),
    },
  }
}

export async function fetchDashboardStats(
  supabase: SupabaseClient,
  filters: {
    from?: string
    to?: string
    category?: string
    marketplace?: string
    status?: string
    fault?: string
    userId?: string
    search?: string
    queue?: IncidentListFilters['queue']
  }
): Promise<DashboardStats> {
  if (filters.search?.trim()) {
    return fetchSearchScopedDashboardStats(supabase, filters)
  }

  const { data, error } = await supabase.rpc('incident_dashboard_stats', {
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_category: filters.category || null,
    p_marketplace: filters.marketplace || null,
    p_status: filters.status || null,
    p_fault_party: filters.fault || null,
    p_user_id: filters.userId || null,
  })

  if (error) throw error
  return parseDashboardStats(data)
}

/** Stats for text search: RPC has no search param; aggregate matching rows client-side. */
async function fetchSearchScopedDashboardStats(
  supabase: SupabaseClient,
  filters: {
    from?: string
    to?: string
    category?: string
    marketplace?: string
    status?: string
    fault?: string
    userId?: string
    search?: string
    queue?: IncidentListFilters['queue']
  }
): Promise<DashboardStats> {
  const listFilters: IncidentListFilters = {
    from: filters.from,
    to: filters.to,
    cat: filters.category,
    mp: filters.marketplace,
    stat: filters.status,
    fault: filters.fault,
    queue: filters.queue,
    search: filters.search,
    userId: filters.userId,
  }

  const { data, error } = await applyIncidentListFilters(
    supabase.from('incidents').select('status, assigned_to'),
    listFilters
  )

  if (error) throw error

  const rows = data ?? []
  const byName: Record<string, number> = {}
  let totalOpen = 0
  let waitingOnWarehouse = 0
  let myQueue = 0

  for (const row of rows) {
    const status = String(row.status)
    byName[status] = (byName[status] ?? 0) + 1
    if (status !== 'Resolved' && status !== 'Closed') totalOpen += 1
    if (status === WAITING_ON_WAREHOUSE) waitingOnWarehouse += 1
    if (filters.userId && row.assigned_to === filters.userId && status !== 'Resolved' && status !== 'Closed') {
      myQueue += 1
    }
  }

  const by_status = STATUS_VALUES.map(name => ({ name, count: byName[name] ?? 0 }))

  return {
    ...EMPTY_STATS,
    total_all: rows.length,
    total_open: totalOpen,
    waiting_on_warehouse: waitingOnWarehouse,
    my_queue: myQueue,
    by_status,
  }
}
