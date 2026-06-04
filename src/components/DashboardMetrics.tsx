'use client'

import {
  formatIdr,
  trendLabel,
  categorySolidStyle,
} from '../lib/incident-status'
import type { DashboardStats } from '../lib/dashboard-stats'

type Props = {
  stats: DashboardStats
  categoryColors: Record<string, string>
}

function StatCard({
  label,
  value,
  sub,
  className = 'bg-white border-slate-200',
  valueClass = 'text-slate-900',
}: {
  label: string
  value: string | number
  sub?: string
  className?: string
  valueClass?: string
}) {
  return (
    <div className={`p-4 rounded-2xl border-2 shadow-sm ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</p>
      <p className={`text-2xl font-black mt-1 ${valueClass}`}>{value}</p>
      {sub && <p className="text-[11px] font-medium mt-1 opacity-70">{sub}</p>}
    </div>
  )
}

function BarChart({
  title,
  rows,
  barClass,
  getBarClass,
}: {
  title: string
  rows: { name: string; count: number; percentage?: number }[]
  barClass?: string
  getBarClass?: (name: string) => string
}) {
  return (
    <div className="bg-white/90 p-5 rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col min-h-[200px]">
      <h3 className="text-sm font-bold text-slate-900 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 font-medium">No data</p>
      ) : (
        <div className="space-y-3 overflow-y-auto max-h-[180px] pr-1">
          {rows.map(row => (
            <div key={row.name}>
              <div className="flex justify-between text-xs mb-1 font-bold text-slate-800">
                <span className="truncate pr-2">{row.name}</span>
                <span className="shrink-0">{row.count}{row.percentage != null ? ` (${row.percentage}%)` : ''}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${getBarClass ? getBarClass(row.name) : barClass ?? 'bg-slate-700'}`}
                  style={{ width: `${row.percentage ?? 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DashboardMetrics({ stats, categoryColors }: Props) {
  const openStatuses = stats.by_status.filter(s =>
    !['Resolved', 'Closed'].includes(s.name)
  )

  return (
    <div className="space-y-4 mb-8">
      {/* Row 1: operational KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Open" value={stats.total_open} sub={`${stats.total_all} in filter`} />
        <StatCard
          label="SLA Breaches"
          value={stats.sla_breaches}
          sub="stuck 3+ days"
          className={stats.sla_breaches > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}
          valueClass={stats.sla_breaches > 0 ? 'text-rose-800' : 'text-slate-900'}
        />
        <StatCard
          label="Waiting on Warehouse"
          value={stats.waiting_on_warehouse}
          className={stats.waiting_on_warehouse > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'}
          valueClass={stats.waiting_on_warehouse > 0 ? 'text-orange-800' : 'text-slate-900'}
        />
        <StatCard label="My Queue" value={stats.my_queue} sub="assigned to you" className="bg-blue-50 border-blue-200" valueClass="text-blue-900" />
        <StatCard
          label="Avg Resolution"
          value={stats.avg_resolution_hours != null ? `${stats.avg_resolution_hours}h` : '—'}
          sub="resolved cases"
        />
        <StatCard
          label="Financial Impact"
          value={formatIdr(stats.financial_impact)}
          sub="refunds + fees"
          className="bg-violet-50 border-violet-200"
          valueClass="text-violet-900 text-lg"
        />
      </div>

      {/* Row 2: aging + trend + blocked-by */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border-2 border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Open Case Aging</h3>
          <div className="space-y-2">
            {[
              { label: '0–1 day', count: stats.aging.d0_1, color: 'bg-emerald-500' },
              { label: '1–3 days', count: stats.aging.d1_3, color: 'bg-amber-500' },
              { label: '3+ days (at risk)', count: stats.aging.d3_plus, color: 'bg-rose-500' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${row.color}`} />
                  {row.label}
                </span>
                <span className="font-black text-slate-900">{row.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border-2 border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Weekly Trend</h3>
          <p className="text-3xl font-black text-slate-900">{stats.trend.this_week}</p>
          <p className="text-xs font-bold text-slate-500 mt-1">
            {trendLabel(stats.trend.this_week, stats.trend.last_week)}
          </p>
          <p className="text-xs text-slate-400 mt-2">Last week: {stats.trend.last_week} new incidents</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border-2 border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Blocked By</h3>
          {stats.by_blocked.length === 0 ? (
            <p className="text-sm text-slate-500 font-medium">No cases waiting on external parties</p>
          ) : (
            <div className="space-y-2">
              {stats.by_blocked.map(row => (
                <div key={row.name} className="flex justify-between text-sm font-bold">
                  <span className="text-slate-700">{row.name}</span>
                  <span className="text-slate-900">{row.count}</span>
                </div>
              ))}
            </div>
          )}
          {openStatuses.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
              {openStatuses.slice(0, 4).map(s => (
                <span key={s.name} className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded-lg">
                  {s.name}: {s.count}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: breakdown charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BarChart
          title="By Category"
          rows={stats.by_category}
          getBarClass={name => categorySolidStyle(categoryColors[name])}
        />
        <BarChart title="By Marketplace" rows={stats.by_marketplace} barClass="bg-slate-700" />
        <BarChart title="By Fault Party" rows={stats.by_fault} barClass="bg-indigo-500" />
      </div>
    </div>
  )
}
