'use client'

import {
  formatIdr,
  trendLabel,
  categorySolidStyle,
  statusMeta,
  STATUS_VALUES,
} from '../lib/incident-status'
import {
  formatHours,
  weeklyFlowLabel,
  openStatusBreakdown,
  closedStatusBreakdown,
  type DashboardStats,
  type ChartRow,
  type PicWorkload,
} from '../lib/dashboard-stats'
import type { DashboardMetricClick } from '../lib/dashboard-metric-clicks'

type Props = {
  stats: DashboardStats
  categoryColors: Record<string, string>
  /** When true (active search), only total case count and per-status totals are shown. */
  compact?: boolean
  activeMetricKey?: string | null
  onMetricClick?: (click: DashboardMetricClick) => void
}

function activeRing(isActive: boolean) {
  return isActive ? 'ring-2 ring-blue-500 ring-offset-2' : ''
}

function StatCard({
  label,
  value,
  sub,
  className = 'bg-white border-zinc-200',
  valueClass = 'text-zinc-900',
  labelClass = 'text-zinc-600',
  isActive = false,
  onClick,
}: {
  label: string
  value: string | number
  sub?: string
  className?: string
  valueClass?: string
  labelClass?: string
  isActive?: boolean
  onClick?: () => void
}) {
  const interactive = !!onClick
  const Tag = interactive ? 'button' : 'div'

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      className={`p-4 rounded-xl border shadow-sm text-left w-full transition ${className} ${activeRing(isActive)} ${
        interactive ? 'cursor-pointer hover:brightness-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2' : ''
      }`}
      aria-pressed={interactive ? isActive : undefined}
      title={interactive ? 'Show matching orders in the table below' : undefined}
    >
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${labelClass}`}>{label}</p>
      <p className={`text-2xl font-semibold mt-1 tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs font-medium mt-1 text-zinc-600">{sub}</p>}
    </Tag>
  )
}

function BarChart({
  title,
  rows,
  barClass,
  getBarClass,
  activeMetricKey,
  onRowClick,
  rowKeyPrefix,
}: {
  title: string
  rows: { name: string; count: number; percentage?: number }[]
  barClass?: string
  getBarClass?: (name: string) => string
  activeMetricKey?: string | null
  onRowClick?: (name: string) => void
  rowKeyPrefix: string
}) {
  return (
    <div className="app-card p-5 flex flex-col min-h-[200px]">
      <h3 className="text-sm font-semibold text-zinc-900 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600 font-medium">No data</p>
      ) : (
        <div className="space-y-3 overflow-y-auto max-h-[180px] pr-1">
          {rows.map(row => {
            const rowKey = `${rowKeyPrefix}:${row.name}`
            const isActive = activeMetricKey === rowKey
            const interactive = !!onRowClick && row.count > 0
            const Tag = interactive ? 'button' : 'div'
            return (
              <Tag
                key={row.name}
                type={interactive ? 'button' : undefined}
                onClick={interactive ? () => onRowClick(row.name) : undefined}
                className={`w-full text-left rounded-lg p-1 -mx-1 transition ${activeRing(isActive)} ${
                  interactive ? 'cursor-pointer hover:bg-zinc-50' : ''
                }`}
                aria-pressed={interactive ? isActive : undefined}
              >
                <div className="flex justify-between text-xs mb-1 font-semibold text-zinc-800">
                  <span className="truncate pr-2">{row.name}</span>
                  <span className="shrink-0 tabular-nums text-zinc-700">
                    {row.count}
                    {row.percentage != null ? ` (${row.percentage}%)` : ''}
                  </span>
                </div>
                <div className="w-full bg-zinc-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${getBarClass ? getBarClass(row.name) : barClass ?? 'bg-zinc-700'}`}
                    style={{ width: `${row.percentage ?? 100}%` }}
                  />
                </div>
              </Tag>
            )
          })}
        </div>
      )}
    </div>
  )
}

function statusCountsForPic(pic: PicWorkload) {
  const byName = Object.fromEntries(pic.by_status.map(s => [s.name, s.count]))
  return STATUS_VALUES.filter(s => !['Resolved', 'Closed'].includes(s))
    .map(name => ({ name, count: byName[name] ?? 0 }))
    .filter(s => s.count > 0)
}

function StatusBreakdownList({
  rows,
  total,
  emptyLabel,
  activeMetricKey,
  onStatusClick,
}: {
  rows: ChartRow[]
  total: number
  emptyLabel: string
  activeMetricKey?: string | null
  onStatusClick?: (status: string) => void
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-zinc-500">{emptyLabel}</p>
  }
  return (
    <ul className="space-y-2">
      {rows.map(row => {
        const sm = statusMeta(row.name)
        const pct = total > 0 ? Math.round((row.count / total) * 100) : 0
        const rowKey = `status:${row.name}`
        const isActive = activeMetricKey === rowKey
        const interactive = !!onStatusClick && row.count > 0
        const Tag = interactive ? 'button' : 'li'
        return (
          <Tag
            key={row.name}
            type={interactive ? 'button' : undefined}
            onClick={interactive ? () => onStatusClick(row.name) : undefined}
            className={`w-full text-left rounded-lg transition ${activeRing(isActive)} ${
              interactive ? 'cursor-pointer hover:bg-zinc-50 p-1 -mx-1' : ''
            }`}
            aria-pressed={interactive ? isActive : undefined}
          >
            <div className="flex items-center justify-between gap-2 text-xs mb-1">
              <span className={`inline-flex items-center gap-1.5 font-semibold truncate ${sm.badge} px-2 py-0.5 rounded-md ring-1 ring-inset`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sm.dot}`} />
                <span className="truncate">{row.name}</span>
              </span>
              <span className={`shrink-0 tabular-nums font-semibold ${row.count === 0 ? 'text-zinc-400' : 'text-zinc-800'}`}>
                {row.count}
                <span className="text-zinc-500 font-medium ml-1">({pct}%)</span>
              </span>
            </div>
            <div className="w-full bg-zinc-100 rounded-full h-1.5">
              <div className={`h-1.5 rounded-full ${sm.solid}`} style={{ width: `${pct}%` }} />
            </div>
          </Tag>
        )
      })}
    </ul>
  )
}

function SummaryStat({
  label,
  value,
  sub,
  valueClass = 'text-zinc-900',
  isActive,
  onClick,
}: {
  label: string
  value: number
  sub?: string
  valueClass?: string
  isActive?: boolean
  onClick?: () => void
}) {
  if (!onClick) {
    return (
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">{label}</p>
        <p className={`text-3xl font-semibold tabular-nums mt-0.5 ${valueClass}`}>{value}</p>
        {sub && <p className="text-xs font-medium text-zinc-500">{sub}</p>}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg p-2 -m-2 transition ${activeRing(!!isActive)} hover:bg-zinc-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
      aria-pressed={!!isActive}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">{label}</p>
      <p className={`text-3xl font-semibold tabular-nums mt-0.5 ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs font-medium text-zinc-500">{sub}</p>}
    </button>
  )
}

function OpenStatCard({
  stats,
  compact = false,
  activeMetricKey,
  onMetricClick,
}: {
  stats: DashboardStats
  compact?: boolean
  activeMetricKey?: string | null
  onMetricClick?: (click: DashboardMetricClick) => void
}) {
  const openRows = openStatusBreakdown(stats.by_status).filter(r => r.count > 0)
  const closedRows = closedStatusBreakdown(stats.by_status)
  const totalOpen = stats.total_open
  const totalClosed = closedRows.reduce((n, r) => n + r.count, 0)
  const totalAll = stats.total_all
  const click = onMetricClick

  return (
    <div className="p-4 rounded-xl border shadow-sm bg-white border-zinc-200">
      <div className={`flex flex-col gap-4 ${compact ? '' : 'sm:flex-row sm:items-start sm:justify-between'}`}>
        <div className={compact ? 'shrink-0' : 'flex flex-wrap items-baseline gap-x-6 gap-y-2 shrink-0'}>
          <SummaryStat
            label={compact ? 'Matching cases' : 'Cases in filter'}
            value={totalAll}
            isActive={activeMetricKey === 'all'}
            onClick={click ? () => click({ key: 'all' }) : undefined}
          />
          {!compact && (
            <>
              <SummaryStat
                label="Open"
                value={totalOpen}
                sub="ongoing"
                isActive={activeMetricKey === 'open'}
                onClick={click && totalOpen > 0 ? () => click({ key: 'open' }) : undefined}
              />
              <SummaryStat
                label="Resolved / closed"
                value={totalClosed}
                valueClass={totalClosed > 0 ? 'text-emerald-800' : 'text-zinc-400'}
                isActive={activeMetricKey === 'closed'}
                onClick={click && totalClosed > 0 ? () => click({ key: 'closed' }) : undefined}
              />
            </>
          )}
        </div>

        <div className={`flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0 ${compact ? '' : 'border-t sm:border-t-0 sm:border-l border-zinc-100 pt-4 sm:pt-0 sm:pl-4'}`}>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">By open status</p>
            <StatusBreakdownList
              rows={openRows}
              total={totalOpen}
              emptyLabel="No open cases in the current filter."
              activeMetricKey={activeMetricKey}
              onStatusClick={click ? status => click({ key: 'status', status }) : undefined}
            />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">Resolved & closed</p>
            <StatusBreakdownList
              rows={closedRows}
              total={totalAll}
              emptyLabel=""
              activeMetricKey={activeMetricKey}
              onStatusClick={click ? status => click({ key: 'status', status }) : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function PicWorkloadCard({
  rows,
  totalOpen,
  activeMetricKey,
  onMetricClick,
}: {
  rows: PicWorkload[]
  totalOpen: number
  activeMetricKey?: string | null
  onMetricClick?: (click: DashboardMetricClick) => void
}) {
  const unassigned = rows.find(p => p.pic_name === 'Unassigned')
  const assigned = rows.filter(p => p.pic_name !== 'Unassigned')

  const picClick = (pic: PicWorkload) => {
    onMetricClick?.({ key: 'pic', picId: pic.pic_id })
  }

  return (
    <div className="app-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Active workload by PIC</h3>
          <p className="text-xs text-zinc-600 mt-0.5">
            Open cases per assignee, broken down by status (respects filters above)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className="app-chip tabular-nums">{totalOpen} active total</span>
          {unassigned && unassigned.total_active > 0 && (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 tabular-nums">
              {unassigned.total_active} unassigned
            </span>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600">No active cases in the current filter.</p>
      ) : (
        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
          {assigned.map(pic => {
            const picKey = pic.pic_id ? `pic:${pic.pic_id}` : 'pic:unassigned'
            const isActive = activeMetricKey === picKey
            return (
              <button
                key={pic.pic_id ?? pic.pic_name}
                type="button"
                onClick={() => picClick(pic)}
                className={`w-full text-left rounded-lg border border-zinc-200 bg-zinc-50/80 px-4 py-3 transition hover:bg-zinc-100/80 ${activeRing(isActive)}`}
                aria-pressed={isActive}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-sm font-semibold text-zinc-900 truncate">{pic.pic_name}</span>
                  <span className="text-lg font-semibold tabular-nums text-zinc-900 shrink-0">{pic.total_active}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {statusCountsForPic(pic).map(s => {
                    const sm = statusMeta(s.name)
                    return (
                      <span
                        key={s.name}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ring-inset ${sm.badge}`}
                      >
                        {s.name}
                        <span className="tabular-nums">{s.count}</span>
                      </span>
                    )
                  })}
                </div>
              </button>
            )
          })}
          {unassigned && unassigned.total_active > 0 && (
            <button
              type="button"
              onClick={() => onMetricClick?.({ key: 'pic', picId: null })}
              className={`w-full text-left rounded-lg border border-dashed border-amber-300 bg-amber-50/60 px-4 py-3 transition hover:bg-amber-50 ${activeRing(activeMetricKey === 'pic:unassigned')}`}
              aria-pressed={activeMetricKey === 'pic:unassigned'}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-sm font-semibold text-amber-950">Unassigned</span>
                <span className="text-lg font-semibold tabular-nums text-amber-950 shrink-0">{unassigned.total_active}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {statusCountsForPic(unassigned).map(s => {
                  const sm = statusMeta(s.name)
                  return (
                    <span
                      key={s.name}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ring-inset ${sm.badge}`}
                    >
                      {s.name}
                      <span className="tabular-nums">{s.count}</span>
                    </span>
                  )
                })}
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function DashboardMetrics({
  stats,
  categoryColors,
  compact = false,
  activeMetricKey,
  onMetricClick,
}: Props) {
  const flowNet = stats.trend.this_week_resolved - stats.trend.this_week
  const click = onMetricClick

  if (compact) {
    return (
      <div className="mb-3">
        <OpenStatCard stats={stats} compact activeMetricKey={activeMetricKey} onMetricClick={click} />
      </div>
    )
  }

  return (
    <div className="space-y-3 mb-8">
      <OpenStatCard stats={stats} activeMetricKey={activeMetricKey} onMetricClick={click} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="SLA breaches"
          value={stats.sla_breaches}
          sub="stuck 3+ days"
          className={stats.sla_breaches > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-zinc-200'}
          valueClass={stats.sla_breaches > 0 ? 'text-red-800' : 'text-zinc-900'}
          labelClass={stats.sla_breaches > 0 ? 'text-red-700' : 'text-zinc-600'}
          isActive={activeMetricKey === 'sla'}
          onClick={click && stats.sla_breaches > 0 ? () => click({ key: 'sla' }) : undefined}
        />
        <StatCard
          label="Waiting on warehouse"
          value={stats.waiting_on_warehouse}
          className={stats.waiting_on_warehouse > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-zinc-200'}
          valueClass={stats.waiting_on_warehouse > 0 ? 'text-orange-900' : 'text-zinc-900'}
          labelClass={stats.waiting_on_warehouse > 0 ? 'text-orange-800' : 'text-zinc-600'}
          isActive={activeMetricKey === 'warehouse'}
          onClick={click && stats.waiting_on_warehouse > 0 ? () => click({ key: 'warehouse' }) : undefined}
        />
        <StatCard
          label="My queue"
          value={stats.my_queue}
          sub="assigned to you"
          className="bg-blue-50 border-blue-200"
          valueClass="text-blue-900"
          labelClass="text-blue-800"
          isActive={activeMetricKey === 'mine'}
          onClick={click && stats.my_queue > 0 ? () => click({ key: 'mine' }) : undefined}
        />
        <StatCard
          label="Financial impact"
          value={formatIdr(stats.financial_impact)}
          sub="refunds + fees"
          className="bg-violet-50 border-violet-200"
          valueClass="text-violet-900 text-lg"
          labelClass="text-violet-800"
          isActive={activeMetricKey === 'financial'}
          onClick={click && stats.financial_impact > 0 ? () => click({ key: 'financial' }) : undefined}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Avg first response"
          value={formatHours(stats.avg_first_response_hours)}
          sub={stats.first_response_count > 0 ? `${stats.first_response_count} cases with activity` : 'comment or status update'}
          className="bg-teal-50 border-teal-200"
          valueClass="text-teal-900"
          labelClass="text-teal-800"
          isActive={activeMetricKey === 'first_response'}
          onClick={click && stats.first_response_count > 0 ? () => click({ key: 'first_response' }) : undefined}
        />
        <StatCard
          label="Avg warehouse cycle"
          value={formatHours(stats.avg_warehouse_cycle_hours)}
          sub={stats.warehouse_cycle_count > 0 ? `${stats.warehouse_cycle_count} handoffs completed` : 'request → completed'}
          className="bg-orange-50 border-orange-200"
          valueClass="text-orange-900"
          labelClass="text-orange-800"
          isActive={activeMetricKey === 'warehouse_cycle'}
          onClick={click && stats.warehouse_cycle_count > 0 ? () => click({ key: 'warehouse_cycle' }) : undefined}
        />
        <StatCard
          label="Avg resolution"
          value={formatHours(stats.avg_resolution_hours)}
          sub="created → resolved"
          isActive={activeMetricKey === 'resolution'}
          onClick={click ? () => click({ key: 'resolution' }) : undefined}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="app-card p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-3">Open case aging</h3>
          <div className="space-y-2">
            {[
              { label: '0–1 day', count: stats.aging.d0_1, color: 'bg-emerald-500', bucket: '0_1' as const },
              { label: '1–3 days', count: stats.aging.d1_3, color: 'bg-amber-500', bucket: '1_3' as const },
              { label: '3+ days (at risk)', count: stats.aging.d3_plus, color: 'bg-red-500', bucket: '3_plus' as const },
            ].map(row => {
              const rowKey = `aging:${row.bucket}`
              const isActive = activeMetricKey === rowKey
              const interactive = !!click && row.count > 0
              const Tag = interactive ? 'button' : 'div'
              return (
                <Tag
                  key={row.label}
                  type={interactive ? 'button' : undefined}
                  onClick={interactive ? () => click({ key: 'aging', bucket: row.bucket }) : undefined}
                  className={`flex items-center justify-between text-sm w-full rounded-lg px-1 py-1 -mx-1 transition ${activeRing(isActive)} ${
                    interactive ? 'cursor-pointer hover:bg-zinc-50' : ''
                  }`}
                  aria-pressed={interactive ? isActive : undefined}
                >
                  <span className="font-medium text-zinc-700 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${row.color}`} />
                    {row.label}
                  </span>
                  <span className="font-semibold tabular-nums text-zinc-900">{row.count}</span>
                </Tag>
              )
            })}
          </div>
        </div>

        <div className="app-card p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-3">Weekly flow</h3>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={click && stats.trend.this_week > 0 ? () => click({ key: 'opened_this_week' }) : undefined}
              disabled={!click || stats.trend.this_week === 0}
              className={`text-left rounded-lg p-2 -m-2 transition ${activeRing(activeMetricKey === 'opened_this_week')} ${
                click && stats.trend.this_week > 0 ? 'cursor-pointer hover:bg-zinc-50' : 'cursor-default'
              }`}
              aria-pressed={activeMetricKey === 'opened_this_week'}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Opened</p>
              <p className="text-2xl font-semibold tabular-nums text-zinc-900">{stats.trend.this_week}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Last week: {stats.trend.last_week}</p>
              <p className="text-[11px] text-zinc-600 mt-1">{trendLabel(stats.trend.this_week, stats.trend.last_week)}</p>
            </button>
            <button
              type="button"
              onClick={click && stats.trend.this_week_resolved > 0 ? () => click({ key: 'resolved_this_week' }) : undefined}
              disabled={!click || stats.trend.this_week_resolved === 0}
              className={`text-left rounded-lg p-2 -m-2 transition ${activeRing(activeMetricKey === 'resolved_this_week')} ${
                click && stats.trend.this_week_resolved > 0 ? 'cursor-pointer hover:bg-zinc-50' : 'cursor-default'
              }`}
              aria-pressed={activeMetricKey === 'resolved_this_week'}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Resolved</p>
              <p className="text-2xl font-semibold tabular-nums text-emerald-800">{stats.trend.this_week_resolved}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Last week: {stats.trend.last_week_resolved}</p>
              <p className="text-[11px] text-zinc-600 mt-1">{trendLabel(stats.trend.this_week_resolved, stats.trend.last_week_resolved)}</p>
            </button>
          </div>
          <p className={`text-xs font-semibold mt-4 pt-3 border-t border-zinc-100 ${flowNet >= 0 ? 'text-emerald-700' : 'text-amber-800'}`}>
            {weeklyFlowLabel(stats.trend.this_week, stats.trend.this_week_resolved)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">Rolling 7 days · category & marketplace filters apply</p>
        </div>

        <div className="app-card p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-3">Blocked by</h3>
          {stats.by_blocked.length === 0 ? (
            <p className="text-sm text-zinc-600 font-medium">No cases waiting on external parties</p>
          ) : (
            <div className="space-y-2">
              {stats.by_blocked.map(row => {
                const party = row.name as 'Warehouse' | 'Customer' | 'Marketplace'
                const rowKey = `blocked:${party}`
                const isActive = activeMetricKey === rowKey
                const interactive = !!click && row.count > 0
                const Tag = interactive ? 'button' : 'div'
                return (
                  <Tag
                    key={row.name}
                    type={interactive ? 'button' : undefined}
                    onClick={interactive ? () => click({ key: 'blocked', party }) : undefined}
                    className={`flex justify-between text-sm font-semibold w-full rounded-lg px-1 py-1 -mx-1 transition ${activeRing(isActive)} ${
                      interactive ? 'cursor-pointer hover:bg-zinc-50' : ''
                    }`}
                    aria-pressed={interactive ? isActive : undefined}
                  >
                    <span className="text-zinc-700">{row.name}</span>
                    <span className="tabular-nums text-zinc-900">{row.count}</span>
                  </Tag>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <PicWorkloadCard
        rows={stats.by_pic}
        totalOpen={stats.total_open}
        activeMetricKey={activeMetricKey}
        onMetricClick={click}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <BarChart
          title="By category"
          rows={stats.by_category}
          getBarClass={name => categorySolidStyle(categoryColors[name])}
          activeMetricKey={activeMetricKey}
          rowKeyPrefix="category"
          onRowClick={click ? name => click({ key: 'category', category: name }) : undefined}
        />
        <BarChart
          title="By marketplace"
          rows={stats.by_marketplace}
          barClass="bg-zinc-700"
          activeMetricKey={activeMetricKey}
          rowKeyPrefix="marketplace"
          onRowClick={click ? name => click({ key: 'marketplace', marketplace: name }) : undefined}
        />
        <BarChart
          title="By fault party"
          rows={stats.by_fault}
          barClass="bg-indigo-500"
          activeMetricKey={activeMetricKey}
          rowKeyPrefix="fault"
          onRowClick={click ? name => click({ key: 'fault', fault: name }) : undefined}
        />
      </div>
    </div>
  )
}
