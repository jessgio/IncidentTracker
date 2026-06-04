'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '../utils/supabase/client'
import { ManageListsModal } from './ManageListsModal'
import DashboardMetrics from './DashboardMetrics'
import {
  incidentExtraFields, emptyExtraFormState, extraFormToDbPayload, formatExtraValue, formatDateOnly, csvEscape,
  type ExtraFormState, type IncidentExtraDbFields, type ExtraFieldKey
} from '../lib/incident-extra-fields'
import {
  STATUS_VALUES, DEFAULT_STATUS, WAITING_ON_WAREHOUSE,
  DASHBOARD_TABLE_EXTRA_KEYS, statusMeta, statusChangePatch,
  categoryRingStyle, CATEGORY_COLOR_OPTIONS,
  type UserRole,
} from '../lib/incident-status'
import { EMPTY_STATS, fetchDashboardStats, type DashboardStats } from '../lib/dashboard-stats'

type Attachment = { id: string; file_name: string; file_type: string; file_url: string; created_at: string }

type Incident = {
  id: string; title: string; status: string; category: string; marketplace: string;
  order_number: string; complaint_date: string; created_at: string; ai_suggestion: string | null;
  attachments?: Attachment[]
} & IncidentExtraDbFields

type Marketplace = { id: string; name: string }
type Category = { id: string; name: string; color: string }

const tableExtraFields = incidentExtraFields.filter(f =>
  (DASHBOARD_TABLE_EXTRA_KEYS as readonly string[]).includes(f.key)
)

// Helper for cross-origin downloads
const downloadFile = async (e: React.MouseEvent, url: string, filename: string) => {
  e.stopPropagation() // Prevent row click
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(blobUrl)
  } catch (err) {
    window.open(url, '_blank') // Fallback if CORS blocks the fetch
  }
}

function InlineAdd({ onAdd, onCancel, placeholder, extraField }: any) {
  const [name, setName] = useState(''); const [extra, setExtra] = useState(extraField?.options[0]?.value || '')
  return (
    <div className="flex gap-1.5 items-center flex-wrap">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (name) onAdd(name, extra) } if (e.key === 'Escape') onCancel() }} className="flex-1 min-w-0 bg-slate-50 border border-slate-300 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder:text-slate-500" placeholder={placeholder} />
      {extraField && <select value={extra} onChange={(e) => setExtra(e.target.value)} className="bg-slate-50 border border-slate-300 px-2 py-2.5 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer">{extraField.options.map((o:any) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
      <button type="button" onClick={() => { if (name) onAdd(name, extra) }} className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-3 py-2.5 rounded-xl text-sm font-bold transition">✓</button>
      <button type="button" onClick={onCancel} className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-3 py-2.5 rounded-xl text-sm font-bold transition">✕</button>
    </div>
  )
}

function EditableCell({ field, value, onSave }: { field: any, value: any, onSave: (val: string) => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const [tempVal, setTempVal] = useState('')
  useEffect(() => { setTempVal(value ?? '') }, [value])
  const handleSave = () => { setIsEditing(false); if (tempVal !== (value ?? '')) onSave(tempVal) }

  if (!isEditing) {
    return (
      <div onClick={(e) => { e.stopPropagation(); setIsEditing(true) }} className="px-2 py-1.5 min-h-[32px] rounded hover:bg-blue-50/50 hover:ring-1 hover:ring-blue-200 cursor-text transition-all flex items-center w-full">
        <span className={!value ? 'text-slate-400 italic' : 'text-slate-900 font-medium'}>{formatExtraValue(value, field.type)}</span>
      </div>
    )
  }
  return (
    <div onClick={(e) => e.stopPropagation()} className="relative w-full">
      {field.type === 'select' ? (
        <select autoFocus value={tempVal} onChange={(e) => setTempVal(e.target.value)} onBlur={handleSave} className="w-full text-sm font-medium p-1.5 border-2 border-blue-400 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200 text-slate-900 bg-white">
          {field.options?.map((o: string) => <option key={o} value={o}>{o || 'Select...'}</option>)}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea autoFocus value={tempVal} onChange={(e) => setTempVal(e.target.value)} onBlur={handleSave} rows={2} className="w-full text-sm font-medium p-1.5 border-2 border-blue-400 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200 text-slate-900 bg-white resize-none" placeholder={field.placeholder} />
      ) : (
        <input autoFocus type={field.type === 'money' ? 'number' : field.type} value={tempVal} onChange={(e) => setTempVal(e.target.value)} onBlur={handleSave} onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }} className="w-full text-sm font-medium p-1.5 border-2 border-blue-400 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200 text-slate-900 bg-white" placeholder={field.placeholder} />
      )}
    </div>
  )
}

const PAGE_SIZE = 25
type QueuePreset = '' | 'mine' | 'warehouse'

export default function DashboardClient({
  userId,
  userEmail,
  userRole,
}: {
  userId: string
  userEmail: string
  userRole: UserRole
}) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS)

  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterMarketplace, setFilterMarketplace] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterQueue, setFilterQueue] = useState<QueuePreset>(
    userRole === 'warehouse' ? 'warehouse' : ''
  )
  const [filterSearch, setFilterSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [marketplace, setMarketplace] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [complaintDate, setComplaintDate] = useState(new Date().toISOString().split('T')[0])
  const [extraForm, setExtraForm] = useState<ExtraFormState>({ ...emptyExtraFormState })
  const [showExtraFields, setShowExtraFields] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [isAddingMp, setIsAddingMp] = useState(false)
  const [isAddingCat, setIsAddingCat] = useState(false)
  const [showManageLists, setShowManageLists] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const supabase = createClient()

  const updateExtraForm = (key: ExtraFieldKey, value: string) => setExtraForm(prev => ({ ...prev, [key]: value }))

  type Filters = {
    from: string; to: string; cat: string; mp: string; stat: string
    queue: QueuePreset; search: string
  }

  const applyFilters = useCallback(<T,>(query: T, f: Filters): T => {
    let q = query as any
    if (f.from) q = q.gte('complaint_date', f.from)
    if (f.to) q = q.lte('complaint_date', f.to)
    if (f.cat) q = q.eq('category', f.cat)
    if (f.mp) q = q.eq('marketplace', f.mp)
    if (f.stat) q = q.eq('status', f.stat)
    if (f.queue === 'mine') q = q.eq('assigned_to', userId)
    if (f.queue === 'warehouse') q = q.eq('status', WAITING_ON_WAREHOUSE)
    if (f.search.trim()) {
      const term = f.search.trim().replace(/%/g, '')
      q = q.or(`title.ilike.%${term}%,order_number.ilike.%${term}%`)
    }
    return q as T
  }, [userId])

  const currentFilters = useCallback((
    from?: string, to?: string, cat?: string, mp?: string, stat?: string,
    queue?: QueuePreset, search?: string
  ): Filters => ({
    from: from ?? filterFrom,
    to: to ?? filterTo,
    cat: cat ?? filterCategory,
    mp: mp ?? filterMarketplace,
    stat: stat ?? filterStatus,
    queue: queue ?? filterQueue,
    search: search ?? filterSearch,
  }), [filterFrom, filterTo, filterCategory, filterMarketplace, filterStatus, filterQueue, filterSearch])

  const fetchStats = useCallback(async (
    from?: string, to?: string, cat?: string, mp?: string, stat?: string
  ) => {
    try {
      const data = await fetchDashboardStats(supabase, {
        from: (from ?? filterFrom) || undefined,
        to: (to ?? filterTo) || undefined,
        category: (cat ?? filterCategory) || undefined,
        marketplace: (mp ?? filterMarketplace) || undefined,
        status: (stat ?? filterStatus) || undefined,
        userId,
      })
      setStats(data)
      setTotalCount(data.total_all)
    } catch {
      // RPC not deployed yet — leave stats empty rather than downloading all rows.
      setStats(EMPTY_STATS)
    }
  }, [supabase, userId, filterFrom, filterTo, filterCategory, filterMarketplace, filterStatus])

  const fetchPage = useCallback(async (
    page: number, from?: string, to?: string, cat?: string, mp?: string, stat?: string,
    queue?: QueuePreset, search?: string
  ) => {
    const f = currentFilters(from, to, cat, mp, stat, queue, search)
    const { count } = await applyFilters(supabase.from('incidents').select('id', { count: 'exact', head: true }), f)
    setTotalPages(Math.max(1, Math.ceil((count || 0) / PAGE_SIZE)))
    setTotalCount(count || 0)
    const start = (page - 1) * PAGE_SIZE
    const end = start + PAGE_SIZE - 1
    const query = applyFilters(
      supabase.from('incidents').select('*, attachments(*)').order('created_at', { ascending: false }).range(start, end),
      f
    )
    const { data } = await query
    if (data) setIncidents(data)
  }, [supabase, applyFilters, currentFilters])

  const fetchDropdowns = useCallback(async () => {
    const { data: mpData } = await supabase.from('marketplaces').select('*').order('name'); if (mpData) { setMarketplaces(mpData); if (mpData.length > 0 && !marketplace) setMarketplace(mpData[0].name) }
    const { data: catData } = await supabase.from('categories').select('*').order('name'); if (catData) { setCategories(catData); if (catData.length > 0 && !category) setCategory(catData[0].name) }
  }, [supabase])

  // Keep the latest callbacks/page in refs so the realtime subscription (set up once)
  // always reads current filters and page instead of values captured on first render.
  const currentPageRef = useRef(1)
  const fetchPageRef = useRef(fetchPage)
  const fetchStatsRef = useRef(fetchStats)
  const fetchDropdownsRef = useRef(fetchDropdowns)
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { fetchPageRef.current = fetchPage }, [fetchPage])
  useEffect(() => { fetchStatsRef.current = fetchStats }, [fetchStats])
  useEffect(() => { fetchDropdownsRef.current = fetchDropdowns }, [fetchDropdowns])

  // Coalesce bursty realtime events (e.g. several agents editing) into one refetch.
  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(() => {
      fetchPageRef.current(currentPageRef.current)
      fetchStatsRef.current()
    }, 400)
  }, [])

  useEffect(() => {
    const initialQueue: QueuePreset = userRole === 'warehouse' ? 'warehouse' : ''
    fetchPage(1, undefined, undefined, undefined, undefined, undefined, initialQueue)
    fetchStats()
    fetchDropdowns()
    const channel = supabase.channel('realtime_dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplaces' }, () => fetchDropdownsRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => fetchDropdownsRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments' }, () => fetchPageRef.current(currentPageRef.current))
      .subscribe()
    return () => { if (refetchTimer.current) clearTimeout(refetchTimer.current); supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  const applyFilter = (
    from: string, to: string, cat: string, mp: string, stat: string,
    queue: QueuePreset = filterQueue, search: string = filterSearch
  ) => {
    setFilterFrom(from); setFilterTo(to); setFilterCategory(cat)
    setFilterMarketplace(mp); setFilterStatus(stat); setFilterQueue(queue); setFilterSearch(search)
    setCurrentPage(1); currentPageRef.current = 1
    fetchPage(1, from, to, cat, mp, stat, queue, search)
    fetchStats(from, to, cat, mp, stat)
  }

  const setQueuePreset = (queue: QueuePreset) => {
    applyFilter(filterFrom, filterTo, filterCategory, filterMarketplace, filterStatus, queue, filterSearch)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    applyFilter(filterFrom, filterTo, filterCategory, filterMarketplace, filterStatus, filterQueue, searchInput)
  }

  const clearAllFilters = () => {
    setSearchInput('')
    applyFilter('', '', '', '', '', '', '')
  }

  const hasActiveFilters = !!(filterFrom || filterTo || filterCategory || filterMarketplace || filterStatus || filterQueue || filterSearch)
  const handlePageChange = (page: number) => { setCurrentPage(page); currentPageRef.current = page; fetchPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!title || !orderNumber || !complaintDate) return; setIsSubmitting(true);
    // Capture values before the form resets so the background AI call uses the right context.
    const submitted = { title, category, marketplace }
    const { data: inserted, error } = await supabase
      .from('incidents')
      .insert([{
        title, category, marketplace, order_number: orderNumber, complaint_date: complaintDate,
        status: DEFAULT_STATUS, status_changed_at: new Date().toISOString(),
        ...extraFormToDbPayload(extraForm),
      }])
      .select('id')
      .single()

    setIsSubmitting(false)
    if (error) { alert('Could not save the incident. Please try again.'); return }

    setTitle(''); setOrderNumber(''); setExtraForm({ ...emptyExtraFormState }); setShowExtraFields(false); setShowForm(false)

    // Generate the draft response in the background; the realtime subscription picks up
    // the update once it lands, so saving never blocks on the AI call.
    if (inserted?.id) {
      const incidentId = inserted.id
      fetch('/api/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submitted) })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.suggestion) {
            return supabase.from('incidents').update({ ai_suggestion: data.suggestion }).eq('id', incidentId)
          }
        })
        .catch(() => {})
    }
  }

  const handleAddMarketplace = async (name: string) => { const { error } = await supabase.from('marketplaces').insert([{ name }]); if (!error) { setMarketplace(name); setIsAddingMp(false) } else alert('Marketplace already exists.') }
  const handleAddCategory = async (name: string, color?: string) => { const { error } = await supabase.from('categories').insert([{ name, color: color || 'slate' }]); if (!error) { setCategory(name); setIsAddingCat(false) } else alert('Category already exists.') }
  
  const updateStatus = async (id: string, newStatus: string) => {
    const inc = incidents.find(i => i.id === id)
    const patch = statusChangePatch(newStatus, {
      resolved_at: (inc as Incident & { resolved_at?: string | null })?.resolved_at,
      warehouse_status: inc?.warehouse_status,
    })
    setIncidents(prev => prev.map(i => i.id === id ? { ...i, ...patch } as Incident : i))
    await supabase.from('incidents').update(patch).eq('id', id)
  }

  const updateIncidentField = async (id: string, key: string, value: string) => {
    let finalValue: string | number | null = value === '' ? null : value
    if (['shipping_fee', 'replacement_fee', 'refund_amount'].includes(key) && finalValue !== null) {
      const parsed = Number(finalValue); finalValue = Number.isFinite(parsed) ? parsed : null
    }
    setIncidents(prev => prev.map(inc => inc.id === id ? { ...inc, [key]: finalValue } : inc))
    await supabase.from('incidents').update({ [key]: finalValue }).eq('id', id)
  }

  const categoryColorByName = Object.fromEntries(categories.map(c => [c.name, c.color]))

  const handleExport = async () => {
    setIsExporting(true); const CHUNK = 1000; let allRows: Incident[] = []; let fromIdx = 0; let keepGoing = true
    try {
      const exportFilters = currentFilters()
      while (keepGoing) {
        const query = applyFilters(supabase.from('incidents').select('*').order('created_at', { ascending: false }).range(fromIdx, fromIdx + CHUNK - 1), exportFilters)
        const { data } = await query; if (!data || data.length === 0) keepGoing = false; else { allRows = [...allRows, ...data]; if (data.length < CHUNK) keepGoing = false; else fromIdx += CHUNK }
      }
      const headers = ['Title', 'Order Number', 'Date', 'Category', 'Marketplace', ...incidentExtraFields.map(f => f.label), 'Status', 'Draft Response', 'Created At']
      const csvRows = [headers.join(','), ...allRows.map(row => [csvEscape(row.title), csvEscape(row.order_number), csvEscape(row.complaint_date), csvEscape(row.category), csvEscape(row.marketplace), ...incidentExtraFields.map(f => csvEscape(row[f.key as keyof IncidentExtraDbFields])), csvEscape(row.status), csvEscape(row.ai_suggestion), csvEscape(row.created_at)].join(','))]
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `incidents-export-${new Date().toISOString().split('T')[0]}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url)
    } catch(err) { alert('Export failed. Please try again.') }
    setIsExporting(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30">
      <div className="max-w-[95%] mx-auto p-4 md:p-8">

        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">Incidents</h1>
            <p className="text-slate-600 mt-1 text-sm font-medium">
              {userRole === 'warehouse'
                ? 'Warehouse queue — cases waiting on fulfillment & shipping'
                : 'Track customer complaints and handoffs to warehouse in real-time'}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider bg-slate-200 text-slate-700 px-3 py-1.5 rounded-full border border-slate-300">
              {userRole === 'warehouse' ? 'Warehouse' : userRole === 'manager' ? 'Manager' : 'CS'}
            </span>
            <button onClick={handleExport} disabled={isExporting} className="flex items-center gap-2 text-sm font-bold bg-white/70 backdrop-blur-sm border-2 border-slate-200/70 px-4 py-2 rounded-full shadow-sm text-slate-800 hover:text-blue-700 hover:bg-white disabled:opacity-50">{isExporting ? 'Exporting...' : 'Export CSV'}</button>
            <button onClick={() => setShowManageLists(true)} className="flex items-center gap-2 text-sm font-bold bg-white/70 backdrop-blur-sm border-2 border-slate-200/70 px-4 py-2 rounded-full shadow-sm text-slate-800 hover:text-blue-700 hover:bg-white">Manage Lists</button>
            <div className="flex items-center gap-2 text-sm font-bold bg-white/70 backdrop-blur-sm border-2 border-slate-200/70 px-4 py-2 rounded-full shadow-sm"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /><span className="text-slate-800">{userEmail}</span></div>
          </div>
        </header>

        {/* FILTERS + QUEUE PRESETS */}
        <div className="bg-white/70 backdrop-blur-sm border-2 border-slate-200/60 rounded-2xl px-6 py-4 mb-4 shadow-sm space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setQueuePreset('')}
              className={`text-xs font-bold px-4 py-2 rounded-xl border-2 transition ${filterQueue === '' && !filterStatus ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}
            >
              All Open
            </button>
            <button
              type="button"
              onClick={() => setQueuePreset('mine')}
              className={`text-xs font-bold px-4 py-2 rounded-xl border-2 transition ${filterQueue === 'mine' ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'}`}
            >
              My Queue {stats.my_queue > 0 && `(${stats.my_queue})`}
            </button>
            <button
              type="button"
              onClick={() => setQueuePreset('warehouse')}
              className={`text-xs font-bold px-4 py-2 rounded-xl border-2 transition ${filterQueue === 'warehouse' ? 'bg-orange-600 text-white border-orange-700' : 'bg-white text-slate-700 border-slate-200 hover:border-orange-300'}`}
            >
              Waiting on Warehouse {stats.waiting_on_warehouse > 0 && `(${stats.waiting_on_warehouse})`}
            </button>
          </div>

          <div className="flex flex-col xl:flex-row xl:items-center gap-4">
            <span className="text-sm font-bold text-slate-800">Filters</span>
            <div className="hidden xl:block w-px h-6 bg-slate-300 flex-shrink-0" />
            <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-3 flex-1">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search order # or description…"
                className="bg-slate-100 border-2 border-slate-200 hover:border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300 min-w-[200px] flex-1 max-w-xs"
              />
              <button type="submit" className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl transition">Search</button>
              <div className="flex items-center gap-2 bg-slate-100 border-2 border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2"><span className="text-xs font-bold text-slate-600">From</span><input type="date" value={filterFrom} onChange={(e) => applyFilter(e.target.value, filterTo, filterCategory, filterMarketplace, filterStatus)} className="bg-transparent text-slate-900 font-medium text-sm focus:outline-none" /></div>
              <div className="flex items-center gap-2 bg-slate-100 border-2 border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2"><span className="text-xs font-bold text-slate-600">To</span><input type="date" value={filterTo} onChange={(e) => applyFilter(filterFrom, e.target.value, filterCategory, filterMarketplace, filterStatus)} className="bg-transparent text-slate-900 font-medium text-sm focus:outline-none" /></div>
              <select value={filterStatus} onChange={(e) => applyFilter(filterFrom, filterTo, filterCategory, filterMarketplace, e.target.value, filterQueue === 'warehouse' ? '' : filterQueue)} className="bg-slate-100 border-2 border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300"><option value="">All Statuses</option>{STATUS_VALUES.map(s => <option key={s} value={s}>{s}</option>)}</select>
              <select value={filterCategory} onChange={(e) => applyFilter(filterFrom, filterTo, e.target.value, filterMarketplace, filterStatus)} className="bg-slate-100 border-2 border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300"><option value="">All Categories</option>{categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
              <select value={filterMarketplace} onChange={(e) => applyFilter(filterFrom, filterTo, filterCategory, e.target.value, filterStatus)} className="bg-slate-100 border-2 border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300"><option value="">All Marketplaces</option>{marketplaces.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}</select>
              {hasActiveFilters && (<button type="button" onClick={clearAllFilters} className="text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 px-4 py-2.5 rounded-xl transition shadow-sm border border-rose-600">Clear</button>)}
            </form>
          </div>
        </div>

        <DashboardMetrics stats={stats} categoryColors={categoryColorByName} />

        {/* LOG NEW FORM */}
        <div className="mb-8">
          {!showForm ? (<button onClick={() => setShowForm(true)} className="bg-white hover:bg-blue-50 border-2 border-dashed border-blue-300 text-blue-700 px-6 py-4 rounded-2xl w-full flex items-center justify-center gap-2 font-bold shadow-sm transition"><span className="text-xl">+</span> Log New Incident</button>) : (
            <div className="bg-white p-7 rounded-2xl shadow-sm border-2 border-slate-200">
              <div className="flex justify-between mb-5"><h2 className="text-xl font-black text-slate-900">New Incident</h2><button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-800 font-bold text-lg">✕</button></div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div><label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Description</label><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border-2 rounded-xl px-4 py-2.5 text-slate-900 border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 font-medium" required /></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Order #</label><input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} className="w-full border-2 rounded-xl px-4 py-2.5 text-slate-900 border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 font-medium" required /></div>
                  <div><label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Date</label><input type="date" value={complaintDate} onChange={(e) => setComplaintDate(e.target.value)} className="w-full border-2 rounded-xl px-4 py-2.5 text-slate-900 border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 font-medium" required /></div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Category</label>
                    {isAddingCat ? <InlineAdd onCancel={() => setIsAddingCat(false)} onAdd={handleAddCategory} extraField={{ label: 'Color', options: CATEGORY_COLOR_OPTIONS.map(c=>({label:c,value:c})) }} placeholder="Name" /> :
                    <div className="flex gap-1.5"><select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border-2 rounded-xl px-4 py-2.5 text-slate-900 border-slate-300 focus:border-blue-400 font-medium"><option value="">Select...</option>{categories.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select><button type="button" onClick={() => setIsAddingCat(true)} className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 rounded-xl transition">+</button></div>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Marketplace</label>
                    {isAddingMp ? <InlineAdd onCancel={() => setIsAddingMp(false)} onAdd={handleAddMarketplace} placeholder="Name" /> : 
                    <div className="flex gap-1.5"><select value={marketplace} onChange={(e) => setMarketplace(e.target.value)} className="w-full border-2 rounded-xl px-4 py-2.5 text-slate-900 border-slate-300 focus:border-blue-400 font-medium"><option value="">Select...</option>{marketplaces.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}</select><button type="button" onClick={() => setIsAddingMp(true)} className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 rounded-xl transition">+</button></div>}
                  </div>
                </div>

                <div className="border-t-2 border-slate-100 pt-5 mt-4">
                  <button type="button" onClick={() => setShowExtraFields(prev => !prev)} className="text-sm font-bold text-blue-600 hover:text-blue-800 transition">{showExtraFields ? 'Hide additional details' : '+ Add additional case details'}</button>
                  {showExtraFields && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mt-5">
                      {incidentExtraFields.map(field => (
                        <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2 lg:col-span-4' : ''}>
                          <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">{field.label}</label>
                          {field.type === 'textarea' ? (
                            <textarea value={extraForm[field.key as ExtraFieldKey]} onChange={(e) => updateExtraForm(field.key as ExtraFieldKey, e.target.value)} placeholder={(field as any).placeholder} rows={2} className="w-full bg-slate-50 border-2 border-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-300 placeholder:text-slate-400 resize-y" />
                          ) : field.type === 'select' ? (
                            <select value={extraForm[field.key as ExtraFieldKey]} onChange={(e) => updateExtraForm(field.key as ExtraFieldKey, e.target.value)} className="w-full bg-slate-50 border-2 border-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-300">
                              {(field as any).options?.map((o: string) => <option key={o} value={o}>{o || 'Select...'}</option>)}
                            </select>
                          ) : (
                            <input type={field.type === 'money' ? 'number' : field.type} step={field.type === 'money' ? '0.01' : undefined} value={extraForm[field.key as ExtraFieldKey]} onChange={(e) => updateExtraForm(field.key as ExtraFieldKey, e.target.value)} placeholder={(field as any).placeholder} className="w-full bg-slate-50 border-2 border-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-blue-300 placeholder:text-slate-400" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t-2 border-slate-100"><button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition">Cancel</button><button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold disabled:bg-slate-400 transition shadow-sm">{isSubmitting ? 'Saving...' : 'Save Incident'}</button></div>
              </form>
            </div>
          )}
        </div>

        {/* TABLE */}
        <div className="px-6 py-3 border-b border-slate-200 bg-white text-xs font-bold text-slate-500 rounded-t-2xl border-x border-t">Tip: Click cells to edit inline. Open a row for full details, comments, and attachments.</div>
        <div className="bg-white rounded-b-2xl shadow-sm border border-slate-200 overflow-hidden relative">
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[1200px] border-collapse relative">
              <thead className="bg-slate-100 border-b-2 border-slate-200">
                <tr>
                  <th className="sticky left-0 z-30 bg-slate-100 text-left px-5 py-4 text-xs font-bold text-slate-600 uppercase tracking-widest w-[240px] min-w-[240px]">Incident</th>
                  <th className="sticky left-[240px] z-30 bg-slate-100 text-left px-5 py-4 text-xs font-bold text-slate-600 uppercase tracking-widest w-[120px] min-w-[120px]">Media</th>
                  <th className="sticky left-[360px] z-30 bg-slate-100 text-left px-5 py-4 text-xs font-bold text-slate-600 uppercase tracking-widest w-[140px] min-w-[140px] border-r-2 border-slate-200 shadow-[4px_0_10px_-3px_rgba(0,0,0,0.1)]">Order #</th>
                  {['Date', 'Category', 'Marketplace'].map(h => <th key={h} className="text-left px-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-widest whitespace-nowrap">{h}</th>)}
                  {tableExtraFields.map(f => <th key={f.key} className="text-left px-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-widest whitespace-nowrap">{f.label}</th>)}
                  <th className="text-left px-4 py-4 text-xs font-bold text-slate-600 uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {incidents.length === 0 ? <tr><td colSpan={7 + tableExtraFields.length} className="p-10 text-center font-medium text-slate-500">No incidents found</td></tr> :
                incidents.map(inc => {
                  const sm = statusMeta(inc.status)
                  return (
                    <tr key={inc.id} onClick={() => window.location.href = `/incidents/${inc.id}`} className="group hover:bg-blue-50 transition cursor-pointer relative">
                      <td className="sticky left-0 z-20 bg-white group-hover:bg-blue-50 transition-colors px-5 py-4 w-[240px] min-w-[240px] align-top"><p className="font-bold text-slate-900 text-sm leading-relaxed line-clamp-2">{inc.title}</p></td>
                      <td className="sticky left-[240px] z-20 bg-white group-hover:bg-blue-50 transition-colors px-4 py-4 w-[120px] min-w-[120px] align-top">
                        {(!inc.attachments || inc.attachments.length === 0) ? (
                          <span className="text-xs font-medium text-slate-400 italic">None</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 mt-0.5">
                            {inc.attachments.slice(0, 3).map(att => {
                              const isImg = att.file_type.startsWith('image')
                              return (
                                <div key={att.id} className="relative w-8 h-8 rounded-lg overflow-hidden border border-slate-300 bg-slate-100 group/att cursor-pointer" onClick={(e) => downloadFile(e, att.file_url, att.file_name)} title={`Download ${att.file_name}`}>
                                  {isImg ? <img src={att.file_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-slate-500">📄</div>}
                                  {/* Download Icon Overlay */}
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/att:opacity-100 flex items-center justify-center transition focus:outline-none">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                  </div>
                                </div>
                              )
                            })}
                            {inc.attachments.length > 3 && (
                               <div className="w-8 h-8 rounded-lg border border-slate-300 bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">+{inc.attachments.length - 3}</div>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="sticky left-[360px] z-20 bg-white group-hover:bg-blue-50 transition-colors px-4 py-4 w-[140px] min-w-[140px] align-top border-r-2 border-slate-100 shadow-[4px_0_10px_-3px_rgba(0,0,0,0.05)]"><span className="font-mono text-xs font-bold bg-slate-200 text-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-300">#{inc.order_number}</span></td>
                      
                      <td className="px-4 py-4 text-sm font-medium text-slate-700 whitespace-nowrap align-top">{formatDateOnly(inc.complaint_date)}</td>
                      <td className="px-4 py-4 align-top"><span className={`px-3 py-1.5 rounded-full text-xs font-bold ring-1 ring-inset ${categoryRingStyle(categories.find(c => c.name === inc.category)?.color)}`}>{inc.category}</span></td>
                      <td className="px-4 py-4 text-sm font-bold text-slate-800 whitespace-nowrap align-top">{inc.marketplace}</td>
                      
                      {tableExtraFields.map(field => {
                        const value = inc[field.key as keyof IncidentExtraDbFields]
                        return (
                          <td key={field.key} className={`px-2 py-2 align-top ${field.tableClass ?? 'min-w-[120px]'}`}>
                            <EditableCell field={field} value={value} onSave={(newVal) => updateIncidentField(inc.id, field.key, newVal)} />
                          </td>
                        )
                      })}

                      <td className="px-4 py-4 whitespace-nowrap align-top" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border-2 ${sm.select}`}><span className={`w-2 h-2 rounded-full flex-shrink-0 ${sm.dot}`} />{inc.status}</div>
                          <select value={inc.status} onChange={(e) => { e.stopPropagation(); updateStatus(inc.id, e.target.value) }} onClick={(e)=>e.stopPropagation()} className="absolute inset-0 opacity-0 w-full cursor-pointer">{STATUS_VALUES.map(s => <option key={s} value={s}>{s}</option>)}</select>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t-2 border-slate-200 bg-slate-100/50">
              <p className="text-sm font-bold text-slate-600">Page <span className="text-slate-900">{currentPage}</span> of {totalPages} <span className="text-slate-400 mx-2">|</span> <span className="text-slate-900">{totalCount}</span> total incidents</p>
              <div className="flex gap-2">
                <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="px-4 py-2 bg-white border-2 border-slate-300 font-bold rounded-xl text-sm text-slate-800 hover:border-slate-400 disabled:opacity-50 transition shadow-sm">← Prev</button>
                <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="px-4 py-2 bg-white border-2 border-slate-300 font-bold rounded-xl text-sm text-slate-800 hover:border-slate-400 disabled:opacity-50 transition shadow-sm">Next →</button>
              </div>
            </div>
          )}
        </div>

        {showManageLists && <ManageListsModal onClose={() => setShowManageLists(false)} />}
      </div>
    </div>
  )
}