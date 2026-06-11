import type { MetricFilter } from './incident-list-filters'
import { BLOCKED_PARTY_STATUS } from './incident-list-filters'

export type DashboardMetricClick =
  | { key: 'sla' }
  | { key: 'warehouse' }
  | { key: 'mine' }
  | { key: 'financial' }
  | { key: 'first_response' }
  | { key: 'warehouse_cycle' }
  | { key: 'resolution' }
  | { key: 'opened_this_week' }
  | { key: 'resolved_this_week' }
  | { key: 'open' }
  | { key: 'closed' }
  | { key: 'all' }
  | { key: 'aging'; bucket: '0_1' | '1_3' | '3_plus' }
  | { key: 'status'; status: string }
  | { key: 'category'; category: string }
  | { key: 'marketplace'; marketplace: string }
  | { key: 'fault'; fault: string }
  | { key: 'blocked'; party: 'Warehouse' | 'Customer' | 'Marketplace' }
  | { key: 'pic'; picId: string | null }

export type MetricClickResult = {
  activeKey: string | null
  metric: MetricFilter | null
  queue: '' | 'mine' | 'warehouse'
  status: string
  category: string
  marketplace: string
  fault: string
}

export function metricClickActiveKey(click: DashboardMetricClick): string {
  switch (click.key) {
    case 'aging':
      return `aging:${click.bucket}`
    case 'status':
      return `status:${click.status}`
    case 'category':
      return `category:${click.category}`
    case 'marketplace':
      return `marketplace:${click.marketplace}`
    case 'fault':
      return `fault:${click.fault}`
    case 'blocked':
      return `blocked:${click.party}`
    case 'pic':
      return click.picId ? `pic:${click.picId}` : 'pic:unassigned'
    default:
      return click.key
  }
}

export function resolveMetricClick(
  click: DashboardMetricClick,
  currentActiveKey: string | null
): MetricClickResult {
  const activeKey = metricClickActiveKey(click)
  const toggleOff = currentActiveKey === activeKey

  if (toggleOff) {
    return {
      activeKey: null,
      metric: null,
      queue: '',
      status: '',
      category: '',
      marketplace: '',
      fault: '',
    }
  }

  const base: MetricClickResult = {
    activeKey,
    metric: null,
    queue: '',
    status: '',
    category: '',
    marketplace: '',
    fault: '',
  }

  switch (click.key) {
    case 'sla':
      return { ...base, metric: { kind: 'sla' } }
    case 'warehouse':
      return { ...base, queue: 'warehouse' }
    case 'mine':
      return { ...base, queue: 'mine' }
    case 'financial':
      return { ...base, metric: { kind: 'financial' } }
    case 'first_response':
      return { ...base, metric: { kind: 'first_response' } }
    case 'warehouse_cycle':
      return { ...base, metric: { kind: 'warehouse_cycle' } }
    case 'resolution':
      return { ...base, metric: { kind: 'has_resolution' } }
    case 'opened_this_week':
      return { ...base, metric: { kind: 'opened_this_week' } }
    case 'resolved_this_week':
      return { ...base, metric: { kind: 'resolved_this_week' } }
    case 'open':
      return { ...base, metric: { kind: 'open' } }
    case 'closed':
      return { ...base, metric: { kind: 'closed' } }
    case 'all':
      return { ...base, activeKey: null, metric: null }
    case 'aging':
      return { ...base, metric: { kind: 'aging', bucket: click.bucket } }
    case 'status':
      return { ...base, status: click.status }
    case 'category':
      return { ...base, category: click.category }
    case 'marketplace':
      return { ...base, marketplace: click.marketplace }
    case 'fault':
      return { ...base, fault: click.fault }
    case 'blocked':
      return { ...base, status: BLOCKED_PARTY_STATUS[click.party] }
    case 'pic':
      return { ...base, metric: { kind: 'assigned_to', picId: click.picId } }
  }
}
