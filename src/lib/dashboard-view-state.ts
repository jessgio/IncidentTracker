import {
  DASHBOARD_SORTABLE_COLUMNS,
  type DashboardSortColumn,
  type SortDirection,
} from './dashboard-table-sort'
import type { MetricFilter } from './incident-list-filters'
import { STATUS_VALUES } from './incident-status'

export type QueuePreset = '' | 'mine' | 'warehouse'

export type DashboardViewState = {
  from: string
  to: string
  cat: string
  mp: string
  fault: string
  stat: string
  queue: QueuePreset
  search: string
  page: number
  sortColumn: DashboardSortColumn
  sortDirection: SortDirection
  metric: MetricFilter | null
  metricKey: string | null
}

const STORAGE_PREFIX = 'incident-tracker:dashboard-view:'
const SORT_SET = new Set<string>(DASHBOARD_SORTABLE_COLUMNS)
const STATUS_SET = new Set<string>(STATUS_VALUES)
const URL_KEYS = ['from', 'to', 'cat', 'mp', 'fault', 'status', 'queue', 'q', 'page', 'sort', 'dir'] as const

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`
}

export function defaultDashboardView(queue: QueuePreset = ''): DashboardViewState {
  return {
    from: '',
    to: '',
    cat: '',
    mp: '',
    fault: '',
    stat: '',
    queue,
    search: '',
    page: 1,
    sortColumn: 'created_at',
    sortDirection: 'desc',
    metric: null,
    metricKey: null,
  }
}

function parseQueue(value: string | null): QueuePreset | undefined {
  if (value === 'mine' || value === 'warehouse' || value === '') return value
  return undefined
}

function isMetricFilter(value: unknown): value is MetricFilter {
  return !!value && typeof value === 'object' && 'kind' in value && typeof (value as { kind: unknown }).kind === 'string'
}

export function dashboardViewFromSearchParams(params: URLSearchParams): Partial<DashboardViewState> {
  const next: Partial<DashboardViewState> = {}
  const from = params.get('from')
  const to = params.get('to')
  const cat = params.get('cat')
  const mp = params.get('mp')
  const fault = params.get('fault')
  const stat = params.get('status')
  const queue = parseQueue(params.get('queue'))
  const search = params.get('q')
  const pageRaw = Number(params.get('page'))
  const sort = params.get('sort')
  const dir = params.get('dir')

  if (from) next.from = from
  if (to) next.to = to
  if (cat) next.cat = cat
  if (mp) next.mp = mp
  if (fault) next.fault = fault
  if (stat && STATUS_SET.has(stat)) next.stat = stat
  if (queue !== undefined) next.queue = queue
  if (search) next.search = search
  if (Number.isInteger(pageRaw) && pageRaw >= 1) next.page = pageRaw
  if (sort && SORT_SET.has(sort)) next.sortColumn = sort as DashboardSortColumn
  if (dir === 'asc' || dir === 'desc') next.sortDirection = dir
  return next
}

export function searchParamsHaveDashboardView(params: URLSearchParams) {
  return URL_KEYS.some(key => params.has(key))
}

export function dashboardViewToQueryString(state: DashboardViewState) {
  const params = new URLSearchParams()
  if (state.from) params.set('from', state.from)
  if (state.to) params.set('to', state.to)
  if (state.cat) params.set('cat', state.cat)
  if (state.mp) params.set('mp', state.mp)
  if (state.fault) params.set('fault', state.fault)
  if (state.stat) params.set('status', state.stat)
  if (state.queue) params.set('queue', state.queue)
  if (state.search) params.set('q', state.search)
  if (state.page > 1) params.set('page', String(state.page))
  if (state.sortColumn !== 'created_at') params.set('sort', state.sortColumn)
  if (state.sortDirection !== 'desc') params.set('dir', state.sortDirection)
  return params.toString()
}

export function dashboardPathFromView(state: DashboardViewState) {
  const qs = dashboardViewToQueryString(state)
  return qs ? `/?${qs}` : '/'
}

function readSession(userId: string): DashboardViewState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DashboardViewState>
    const base = defaultDashboardView()
    return {
      ...base,
      ...parsed,
      from: typeof parsed.from === 'string' ? parsed.from : '',
      to: typeof parsed.to === 'string' ? parsed.to : '',
      cat: typeof parsed.cat === 'string' ? parsed.cat : '',
      mp: typeof parsed.mp === 'string' ? parsed.mp : '',
      fault: typeof parsed.fault === 'string' ? parsed.fault : '',
      stat: typeof parsed.stat === 'string' && STATUS_SET.has(parsed.stat) ? parsed.stat : '',
      queue: parsed.queue === 'mine' || parsed.queue === 'warehouse' || parsed.queue === '' ? parsed.queue : base.queue,
      search: typeof parsed.search === 'string' ? parsed.search : '',
      page: typeof parsed.page === 'number' && parsed.page >= 1 ? parsed.page : 1,
      sortColumn: parsed.sortColumn && SORT_SET.has(parsed.sortColumn) ? parsed.sortColumn : base.sortColumn,
      sortDirection: parsed.sortDirection === 'asc' || parsed.sortDirection === 'desc' ? parsed.sortDirection : base.sortDirection,
      metric: parsed.metric && isMetricFilter(parsed.metric) ? parsed.metric : null,
      metricKey: typeof parsed.metricKey === 'string' ? parsed.metricKey : null,
    }
  } catch {
    return null
  }
}

export function saveDashboardView(userId: string, state: DashboardViewState) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify(state))
  } catch {
    // Ignore quota / private-mode failures.
  }
  if (window.location.pathname !== '/') return
  const path = dashboardPathFromView(state)
  const current = `${window.location.pathname}${window.location.search}`
  if (current !== path) {
    window.history.replaceState(window.history.state, '', path)
  }
}

export function loadDashboardView(userId: string, fallbackQueue: QueuePreset): DashboardViewState {
  const fallback = defaultDashboardView(fallbackQueue)
  if (typeof window === 'undefined') return fallback
  const params = new URLSearchParams(window.location.search)
  const fromUrl = searchParamsHaveDashboardView(params) ? dashboardViewFromSearchParams(params) : null
  const fromSession = readSession(userId)
  if (fromUrl) return { ...(fromSession ?? fallback), ...fromUrl }
  return fromSession ?? fallback
}

export function getDashboardPath(userId: string, fallbackQueue: QueuePreset = '') {
  return dashboardPathFromView(loadDashboardView(userId, fallbackQueue))
}
