'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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
  categoryRingStyle, CATEGORY_COLOR_OPTIONS, canDeleteIncidents,
  type UserRole,
} from '../lib/incident-status'
import { deleteIncident } from '../lib/delete-incident'
import { EMPTY_STATS, fetchDashboardStats, type DashboardStats } from '../lib/dashboard-stats'
import { attachmentKind, canPreviewInline } from '../lib/attachment-utils'
import {
  buildImportTemplateCsv,
  parseImportCsv,
  importRowToInsertPayload,
  getExportHeaders,
} from '../lib/incident-import'

type Attachment = { id: string; file_name: string; file_type: string; file_url: string; created_at: string }

type Incident = {
  id: string; title: string; status: string; category: string; marketplace: string;
  order_number: string; complaint_date: string; created_at: string; ai_suggestion: string | null;
  assigned_to: string | null;
  profiles?: { full_name: string | null; email: string } | null;
  attachments?: Attachment[]
} & IncidentExtraDbFields

type Marketplace = { id: string; name: string }
type Category = { id: string; name: string; color: string }
type Agent = { id: string; full_name: string | null; email: string }

const tableExtraFields = incidentExtraFields.filter(f =>
  (DASHBOARD_TABLE_EXTRA_KEYS as readonly string[]).includes(f.key)
)

const DASHBOARD_TH = 'text-left px-4 py-3 text-xs font-semibold text-zinc-600 uppercase tracking-wide whitespace-nowrap'
const DASHBOARD_TABLE_MIN_W = 2520

const dashboardCoreCols = {
  date: { th: 'min-w-[7.5rem]', td: 'min-w-[7.5rem] w-[7.5rem] px-4 py-3 align-top whitespace-nowrap text-sm text-zinc-700' },
  category: { th: 'min-w-[10rem]', td: 'min-w-[10rem] w-[10rem] px-4 py-3 align-top' },
  marketplace: { th: 'min-w-[8.5rem]', td: 'min-w-[8.5rem] w-[8.5rem] px-4 py-3 align-top text-sm font-medium text-zinc-800' },
  pic: { th: 'min-w-[11rem]', td: 'min-w-[11rem] w-[11rem] px-4 py-3 align-top' },
  status: { th: 'min-w-[12.5rem]', td: 'min-w-[12.5rem] w-[12.5rem] px-4 py-3 align-top' },
  actions: { th: 'min-w-[5.5rem] w-[5.5rem]', td: 'min-w-[5.5rem] w-[5.5rem] px-4 py-3 text-right align-top' },
} as const

function extraFieldHeaderClass(tableClass?: string) {
  return `${DASHBOARD_TH} ${tableClass ?? 'min-w-[120px]'}`
}

function extraFieldCellClass(tableClass?: string) {
  return `px-4 py-3 align-top ${tableClass ?? 'min-w-[120px]'}`
}

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
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (name) onAdd(name, extra) } if (e.key === 'Escape') onCancel() }} className="app-input flex-1 min-w-0" placeholder={placeholder} />
      {extraField && <select value={extra} onChange={(e) => setExtra(e.target.value)} className="app-select">{extraField.options.map((o:any) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
      <button type="button" onClick={() => { if (name) onAdd(name, extra) }} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition">Add</button>
      <button type="button" onClick={onCancel} className="app-btn-secondary px-3 py-2">Cancel</button>
    </div>
  )
}

function EditableCell({ field, value, onSave }: { field: any, value: any, onSave: (val: string) => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const [tempVal, setTempVal] = useState('')
  useEffect(() => { setTempVal(value ?? '') }, [value])
  const handleSave = () => { setIsEditing(false); if (tempVal !== (value ?? '')) onSave(tempVal) }

  if (!isEditing) {
    const display = formatExtraValue(value, field.type)
    return (
      <div onClick={(e) => { e.stopPropagation(); setIsEditing(true) }} className="min-h-[32px] rounded-md hover:bg-blue-50 cursor-text transition-colors w-full">
        <span
          title={display !== '—' ? display : undefined}
          className={`block text-sm leading-snug px-1 py-1.5 max-w-full ${field.type === 'textarea' ? 'line-clamp-2 whitespace-normal' : 'truncate'} ${!value ? 'text-zinc-500 italic' : 'text-zinc-900 font-medium'}`}
        >
          {display}
        </span>
      </div>
    )
  }
  return (
    <div onClick={(e) => e.stopPropagation()} className="relative w-full">
      {field.type === 'select' ? (
        <select autoFocus value={tempVal} onChange={(e) => setTempVal(e.target.value)} onBlur={handleSave} className="app-select w-full py-1.5">
          {field.options?.map((o: string) => <option key={o} value={o}>{o || 'Select...'}</option>)}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea autoFocus value={tempVal} onChange={(e) => setTempVal(e.target.value)} onBlur={handleSave} rows={2} className="app-input py-1.5 resize-none" placeholder={field.placeholder} />
      ) : (
        <input autoFocus type={field.type === 'money' ? 'number' : field.type} value={tempVal} onChange={(e) => setTempVal(e.target.value)} onBlur={handleSave} onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }} className="app-input py-1.5" placeholder={field.placeholder} />
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
  const [agents, setAgents] = useState<Agent[]>([])
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
  const [assignedTo, setAssignedTo] = useState(userId)
  const [extraForm, setExtraForm] = useState<ExtraFormState>({ ...emptyExtraFormState })
  const [showExtraFields, setShowExtraFields] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [isAddingMp, setIsAddingMp] = useState(false)
  const [isAddingCat, setIsAddingCat] = useState(false)
  const [showManageLists, setShowManageLists] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [deletingIncidentId, setDeletingIncidentId] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const supabase = createClient()
  const router = useRouter()
  const canDeleteCases = canDeleteIncidents(userRole)

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
      supabase.from('incidents').select('*, profiles(full_name, email), attachments(id, file_name, file_type, file_url)').order('created_at', { ascending: false }).range(start, end),
      f
    )
    const { data } = await query
    if (data) setIncidents(data)
  }, [supabase, applyFilters, currentFilters])

  const fetchDropdowns = useCallback(async () => {
    const { data: mpData } = await supabase.from('marketplaces').select('*').order('name'); if (mpData) { setMarketplaces(mpData); if (mpData.length > 0 && !marketplace) setMarketplace(mpData[0].name) }
    const { data: catData } = await supabase.from('categories').select('*').order('name'); if (catData) { setCategories(catData); if (catData.length > 0 && !category) setCategory(catData[0].name) }
    const { data: agentData } = await supabase.from('profiles').select('id, full_name, email').order('full_name')
    if (agentData) setAgents(agentData)
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
        assigned_to: userRole !== 'warehouse' && assignedTo ? assignedTo : null,
        status: DEFAULT_STATUS, status_changed_at: new Date().toISOString(),
        ...extraFormToDbPayload(extraForm),
      }])
      .select('id')
      .single()

    setIsSubmitting(false)
    if (error) { alert('Could not save the incident. Please try again.'); return }

    setTitle(''); setOrderNumber(''); setAssignedTo(userId); setExtraForm({ ...emptyExtraFormState }); setShowExtraFields(false); setShowForm(false)

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
  
  const handleAssigneeChange = async (incidentId: string, assigneeId: string) => {
    const agent = agents.find(a => a.id === assigneeId)
    const assigned_to = assigneeId || null
    const profiles = agent
      ? { full_name: agent.full_name, email: agent.email }
      : null
    setIncidents(prev =>
      prev.map(inc =>
        inc.id === incidentId ? { ...inc, assigned_to, profiles } : inc
      )
    )
    await supabase
      .from('incidents')
      .update({ assigned_to, updated_at: new Date().toISOString() })
      .eq('id', incidentId)
    fetchStats()
  }

  const updateStatus = async (id: string, newStatus: string) => {
    const inc = incidents.find(i => i.id === id)
    const patch = statusChangePatch(newStatus, {
      resolved_at: (inc as Incident & { resolved_at?: string | null })?.resolved_at,
      warehouse_status: inc?.warehouse_status,
    })
    setIncidents(prev => prev.map(i => i.id === id ? { ...i, ...patch } as Incident : i))
    await supabase.from('incidents').update(patch).eq('id', id)
  }

  const handleDeleteIncident = async (
    e: React.MouseEvent,
    inc: Incident
  ) => {
    e.stopPropagation()
    if (!canDeleteCases) return
    const confirmed = window.confirm(
      `Permanently delete this case?\n\nOrder #${inc.order_number}\n${inc.title}\n\nAll comments and attachments will be removed. This cannot be undone.`
    )
    if (!confirmed) return
    setDeletingIncidentId(inc.id)
    const { ok, error } = await deleteIncident(supabase, inc.id)
    setDeletingIncidentId(null)
    if (!ok) {
      alert(error ?? 'Could not delete this case. Please try again.')
      return
    }
    setIncidents(prev => prev.filter(i => i.id !== inc.id))
    fetchStats()
  }

  const updateIncidentField = async (id: string, key: string, value: string) => {
    let finalValue: string | number | null = value === '' ? null : value
    if (['shipping_fee', 'replacement_fee', 'refund_amount'].includes(key) && finalValue !== null) {
      const parsed = Number(finalValue); finalValue = Number.isFinite(parsed) ? parsed : null
    }
    setIncidents(prev => prev.map(inc => inc.id === id ? { ...inc, [key]: finalValue } : inc))
    await supabase.from('incidents').update({ [key]: finalValue }).eq('id', id)
  }

  const categoryColorByName = useMemo(
    () => Object.fromEntries(categories.map(c => [c.name, c.color])),
    [categories]
  )

  const downloadCsvBlob = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleDownloadImportTemplate = () => {
    downloadCsvBlob(buildImportTemplateCsv(), 'incident-import-template.csv')
  }

  const handleImportFile = async (file: File) => {
    if (!/\.(csv|txt)$/i.test(file.name)) {
      alert('Upload a CSV file. In Excel: File → Save As → CSV UTF-8 (comma delimited).')
      return
    }

    setIsImporting(true)
    try {
      const { rows, errors } = parseImportCsv(await file.text())
      const catNames = new Set(categories.map(c => c.name))
      const mpNames = new Set(marketplaces.map(m => m.name))
      const listErrors: string[] = []

      for (const row of rows) {
        if (!catNames.has(row.category)) {
          listErrors.push(`Row ${row.rowNumber}: unknown category "${row.category}". Add it under Manage lists.`)
        }
        if (!mpNames.has(row.marketplace)) {
          listErrors.push(`Row ${row.rowNumber}: unknown marketplace "${row.marketplace}". Add it under Manage lists.`)
        }
      }

      const allErrors = [...errors.map(e => `Row ${e.rowNumber}: ${e.message}`), ...listErrors]
      if (allErrors.length) {
        alert(allErrors.slice(0, 8).join('\n') + (allErrors.length > 8 ? `\n…and ${allErrors.length - 8} more.` : ''))
        return
      }
      if (rows.length === 0) {
        alert('No data rows found. Use the template, fill in your cases, and remove the example row.')
        return
      }
      if (!confirm(`Import ${rows.length} incident${rows.length === 1 ? '' : 's'}?`)) return

      const agentLookup = agents.map(a => ({ id: a.id, email: a.email }))
      const BATCH = 50
      let imported = 0

      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH).map(row =>
          importRowToInsertPayload(row, agentLookup, userId, userRole)
        )
        const { error } = await supabase.from('incidents').insert(chunk)
        if (error) {
          alert(`Import stopped after ${imported} row(s): ${error.message}`)
          break
        }
        imported += chunk.length
      }

      if (imported > 0) {
        alert(`Imported ${imported} incident${imported === 1 ? '' : 's'}.`)
        setCurrentPage(1)
        currentPageRef.current = 1
        await fetchPage(1)
        fetchStats()
      }
    } catch {
      alert('Could not read the file. Please try again.')
    } finally {
      setIsImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const handleExport = async () => {
    setIsExporting(true); const CHUNK = 1000; let allRows: Incident[] = []; let fromIdx = 0; let keepGoing = true
    try {
      const exportFilters = currentFilters()
      while (keepGoing) {
        const query = applyFilters(supabase.from('incidents').select('*').order('created_at', { ascending: false }).range(fromIdx, fromIdx + CHUNK - 1), exportFilters)
        const { data } = await query; if (!data || data.length === 0) keepGoing = false; else { allRows = [...allRows, ...data]; if (data.length < CHUNK) keepGoing = false; else fromIdx += CHUNK }
      }
      const headers = getExportHeaders()
      const picEmailById = Object.fromEntries(agents.map(a => [a.id, a.email]))
      const csvRows = [headers.join(','), ...allRows.map(row => [
        csvEscape(row.title),
        csvEscape(row.order_number),
        csvEscape(row.complaint_date),
        csvEscape(row.category),
        csvEscape(row.marketplace),
        csvEscape(row.assigned_to ? picEmailById[row.assigned_to] ?? '' : ''),
        ...incidentExtraFields.map(f => csvEscape(row[f.key as keyof IncidentExtraDbFields])),
        csvEscape(row.status),
        csvEscape(row.ai_suggestion),
        csvEscape(row.created_at),
      ].join(','))]
      downloadCsvBlob(csvRows.join('\n'), `incidents-export-${new Date().toISOString().split('T')[0]}.csv`)
    } catch(err) { alert('Export failed. Please try again.') }
    setIsExporting(false)
  }

  return (
    <div className="app-page">
      <div className="app-container">

        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Incidents</h1>
            <p className="text-zinc-600 mt-1 text-sm">
              {userRole === 'warehouse'
                ? 'Warehouse queue — fulfillment and shipping'
                : 'Customer complaints and warehouse handoffs'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="app-chip">
              {userRole === 'warehouse' ? 'Warehouse' : userRole === 'manager' ? 'Manager' : 'CS'}
            </span>
            <button type="button" onClick={handleDownloadImportTemplate} className="app-btn-secondary">
              Download import template
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={isImporting || userRole === 'warehouse'}
              className="app-btn-secondary disabled:opacity-50"
              title={userRole === 'warehouse' ? 'Import is available to CS and manager roles' : undefined}
            >
              {isImporting ? 'Importing…' : 'Import CSV'}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleImportFile(file)
              }}
            />
            <button onClick={handleExport} disabled={isExporting} className="app-btn-secondary">
              {isExporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <button onClick={() => setShowManageLists(true)} className="app-btn-secondary">Manage lists</button>
            <span className="app-chip max-w-[220px] truncate" title={userEmail}>
              <span className="w-2 h-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              {userEmail}
            </span>
          </div>
        </header>

        <div className="app-card px-5 py-4 mb-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setQueuePreset('')}
              className={`text-xs font-semibold px-3 py-2 rounded-lg border transition ${filterQueue === '' && !filterStatus ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300'}`}
            >
              All open
            </button>
            <button
              type="button"
              onClick={() => setQueuePreset('mine')}
              className={`text-xs font-semibold px-3 py-2 rounded-lg border transition ${filterQueue === 'mine' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-zinc-700 border-zinc-200 hover:border-blue-300'}`}
            >
              My queue{stats.my_queue > 0 && ` (${stats.my_queue})`}
            </button>
            <button
              type="button"
              onClick={() => setQueuePreset('warehouse')}
              className={`text-xs font-semibold px-3 py-2 rounded-lg border transition ${filterQueue === 'warehouse' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-zinc-700 border-zinc-200 hover:border-orange-300'}`}
            >
              Waiting on warehouse{stats.waiting_on_warehouse > 0 && ` (${stats.waiting_on_warehouse})`}
            </button>
          </div>

          <div className="flex flex-col xl:flex-row xl:items-center gap-4">
            <span className="text-sm font-semibold text-zinc-800 shrink-0">Filters</span>
            <div className="hidden xl:block w-px h-6 bg-zinc-200 shrink-0" />
            <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2 flex-1">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search order # or description…"
                className="app-input min-w-[200px] flex-1 max-w-sm"
              />
              <button type="submit" className="app-btn-primary">Search</button>
              <div className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2">
                <span className="text-xs font-semibold text-zinc-600">From</span>
                <input type="date" value={filterFrom} onChange={(e) => applyFilter(e.target.value, filterTo, filterCategory, filterMarketplace, filterStatus)} className="bg-transparent text-zinc-900 text-sm focus:outline-none" />
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2">
                <span className="text-xs font-semibold text-zinc-600">To</span>
                <input type="date" value={filterTo} onChange={(e) => applyFilter(filterFrom, e.target.value, filterCategory, filterMarketplace, filterStatus)} className="bg-transparent text-zinc-900 text-sm focus:outline-none" />
              </div>
              <select value={filterStatus} onChange={(e) => applyFilter(filterFrom, filterTo, filterCategory, filterMarketplace, e.target.value, filterQueue === 'warehouse' ? '' : filterQueue)} className="app-select"><option value="">All statuses</option>{STATUS_VALUES.map(s => <option key={s} value={s}>{s}</option>)}</select>
              <select value={filterCategory} onChange={(e) => applyFilter(filterFrom, filterTo, e.target.value, filterMarketplace, filterStatus)} className="app-select"><option value="">All categories</option>{categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
              <select value={filterMarketplace} onChange={(e) => applyFilter(filterFrom, filterTo, filterCategory, e.target.value, filterStatus)} className="app-select"><option value="">All marketplaces</option>{marketplaces.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}</select>
              {hasActiveFilters && (
                <button type="button" onClick={clearAllFilters} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 transition">
                  Clear
                </button>
              )}
            </form>
          </div>
        </div>

        <DashboardMetrics stats={stats} categoryColors={categoryColorByName} />

        <div className="mb-6">
          {!showForm ? (
            <button onClick={() => setShowForm(true)} className="app-card w-full border-dashed border-blue-300 px-6 py-4 flex items-center justify-center gap-2 font-semibold text-blue-700 hover:bg-blue-50/50 transition">
              <span className="text-lg" aria-hidden>+</span> Log new incident
            </button>
          ) : (
            <div className="app-card p-6">
              <div className="flex justify-between mb-5">
                <h2 className="text-lg font-semibold text-zinc-900">New incident</h2>
                <button type="button" onClick={() => setShowForm(false)} className="app-btn-ghost text-zinc-500" aria-label="Close form">Close</button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="app-label">Description</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} className="app-input" required />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="app-label">Order #</label>
                    <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} className="app-input" required />
                  </div>
                  <div>
                    <label className="app-label">Date</label>
                    <input type="date" value={complaintDate} onChange={(e) => setComplaintDate(e.target.value)} className="app-input" required />
                  </div>
                  <div>
                    <label className="app-label">Category</label>
                    {isAddingCat ? <InlineAdd onCancel={() => setIsAddingCat(false)} onAdd={handleAddCategory} extraField={{ label: 'Color', options: CATEGORY_COLOR_OPTIONS.map(c=>({label:c,value:c})) }} placeholder="Name" /> :
                    <div className="flex gap-1.5">
                      <select value={category} onChange={(e) => setCategory(e.target.value)} className="app-select w-full"><option value="">Select…</option>{categories.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select>
                      <button type="button" onClick={() => setIsAddingCat(true)} className="app-btn-secondary shrink-0 px-3" aria-label="Add category">+</button>
                    </div>}
                  </div>
                  <div>
                    <label className="app-label">Marketplace</label>
                    {isAddingMp ? <InlineAdd onCancel={() => setIsAddingMp(false)} onAdd={handleAddMarketplace} placeholder="Name" /> :
                    <div className="flex gap-1.5">
                      <select value={marketplace} onChange={(e) => setMarketplace(e.target.value)} className="app-select w-full"><option value="">Select…</option>{marketplaces.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}</select>
                      <button type="button" onClick={() => setIsAddingMp(true)} className="app-btn-secondary shrink-0 px-3" aria-label="Add marketplace">+</button>
                    </div>}
                  </div>
                  {userRole !== 'warehouse' && (
                    <div className="md:col-span-2 lg:col-span-4">
                      <label className="app-label">Assigned PIC</label>
                      <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="app-select w-full max-w-md">
                        <option value="">Unassigned</option>
                        {agents.map(a => (
                          <option key={a.id} value={a.id}>{a.full_name || a.email}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="border-t border-zinc-100 pt-4 mt-2">
                  <button type="button" onClick={() => setShowExtraFields(prev => !prev)} className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition">
                    {showExtraFields ? 'Hide additional details' : 'Add additional case details'}
                  </button>
                  {showExtraFields && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                      {incidentExtraFields.map(field => (
                        <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2 lg:col-span-4' : ''}>
                          <label className="app-label">{field.label}</label>
                          {field.type === 'textarea' ? (
                            <textarea value={extraForm[field.key as ExtraFieldKey]} onChange={(e) => updateExtraForm(field.key as ExtraFieldKey, e.target.value)} placeholder={(field as any).placeholder} rows={2} className="app-input resize-y" />
                          ) : field.type === 'select' ? (
                            <select value={extraForm[field.key as ExtraFieldKey]} onChange={(e) => updateExtraForm(field.key as ExtraFieldKey, e.target.value)} className="app-select w-full">
                              {(field as any).options?.map((o: string) => <option key={o} value={o}>{o || 'Select…'}</option>)}
                            </select>
                          ) : (
                            <input type={field.type === 'money' ? 'number' : field.type} step={field.type === 'money' ? '0.01' : undefined} value={extraForm[field.key as ExtraFieldKey]} onChange={(e) => updateExtraForm(field.key as ExtraFieldKey, e.target.value)} placeholder={(field as any).placeholder} className="app-input" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-zinc-100">
                  <button type="button" onClick={() => setShowForm(false)} className="app-btn-secondary">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="app-btn-primary px-6">{isSubmitting ? 'Saving…' : 'Save incident'}</button>
                </div>
              </form>
            </div>
          )}
        </div>

        <p className="text-xs text-zinc-600 mb-2 px-1">
          Click cells to edit inline. Open a row for details, comments, and attachments.
        </p>
        <div className="app-card overflow-hidden relative">
          <div className="overflow-x-auto w-full">
            <table className="w-max min-w-full border-collapse relative" style={{ minWidth: DASHBOARD_TABLE_MIN_W }}>
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className={`sticky left-0 z-30 bg-zinc-50 ${DASHBOARD_TH} w-[240px] min-w-[240px]`}>Incident</th>
                  <th className={`sticky left-[240px] z-30 bg-zinc-50 ${DASHBOARD_TH} w-[120px] min-w-[120px]`}>Media</th>
                  <th className={`sticky left-[360px] z-30 bg-zinc-50 ${DASHBOARD_TH} w-[140px] min-w-[140px] border-r border-zinc-200 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]`}>Order #</th>
                  <th className={`${DASHBOARD_TH} ${dashboardCoreCols.date.th}`}>Date</th>
                  <th className={`${DASHBOARD_TH} ${dashboardCoreCols.category.th}`}>Category</th>
                  <th className={`${DASHBOARD_TH} ${dashboardCoreCols.marketplace.th}`}>Marketplace</th>
                  {userRole !== 'warehouse' && (
                    <th className={`${DASHBOARD_TH} ${dashboardCoreCols.pic.th}`}>PIC</th>
                  )}
                  {tableExtraFields.map(f => (
                    <th key={f.key} className={extraFieldHeaderClass(f.tableClass)}>{f.label}</th>
                  ))}
                  <th className={`${DASHBOARD_TH} ${dashboardCoreCols.status.th}`}>Status</th>
                  {canDeleteCases && (
                    <th className={`${DASHBOARD_TH} text-right ${dashboardCoreCols.actions.th}`}>Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {incidents.length === 0 ? (
                  <tr>
                    <td colSpan={7 + tableExtraFields.length + (userRole !== 'warehouse' ? 1 : 0) + (canDeleteCases ? 1 : 0)} className="p-10 text-center text-zinc-600">
                      No incidents found
                    </td>
                  </tr>
                ) :
                incidents.map(inc => {
                  const sm = statusMeta(inc.status)
                  return (
                    <tr key={inc.id} onClick={() => router.push(`/incidents/${inc.id}`)} className="group hover:bg-blue-50/80 transition-colors cursor-pointer">
                      <td className="sticky left-0 z-20 bg-white group-hover:bg-blue-50/80 transition-colors px-4 py-3 w-[240px] min-w-[240px] align-top"><p className="font-semibold text-zinc-900 text-sm leading-snug line-clamp-2">{inc.title}</p></td>
                      <td className="sticky left-[240px] z-20 bg-white group-hover:bg-blue-50/80 transition-colors px-3 py-3 w-[120px] min-w-[120px] align-top">
                        {(!inc.attachments || inc.attachments.length === 0) ? (
                          <span className="text-xs text-zinc-500">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {inc.attachments.slice(0, 3).map(att => {
                              const isImg = att.file_type.startsWith('image')
                              const canView = canPreviewInline(attachmentKind(att.file_type, att.file_name))
                              return (
                                <div
                                  key={att.id}
                                  className="relative w-8 h-8 rounded-md overflow-hidden border border-zinc-200 bg-zinc-100 group/att cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (canView) {
                                      window.open(att.file_url, '_blank', 'noopener,noreferrer')
                                    } else {
                                      downloadFile(e, att.file_url, att.file_name)
                                    }
                                  }}
                                  title={canView ? `View ${att.file_name}` : `Download ${att.file_name}`}
                                >
                                  {isImg ? <img src={att.file_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-zinc-600">PDF</div>}
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/att:opacity-100 flex items-center justify-center transition pointer-events-none">
                                    <span className="text-[9px] font-bold text-white">View</span>
                                  </div>
                                </div>
                              )
                            })}
                            {inc.attachments.length > 3 && (
                               <div className="w-8 h-8 rounded-md border border-zinc-200 bg-zinc-100 flex items-center justify-center text-[10px] font-semibold text-zinc-700">+{inc.attachments.length - 3}</div>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="sticky left-[360px] z-20 bg-white group-hover:bg-blue-50/80 transition-colors px-4 py-3 w-[140px] min-w-[140px] align-top border-r border-zinc-100 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.06)]"><span className="font-mono text-xs font-semibold bg-zinc-100 text-zinc-800 px-2 py-1 rounded-md border border-zinc-200">#{inc.order_number}</span></td>
                      
                      <td className={dashboardCoreCols.date.td}>{formatDateOnly(inc.complaint_date)}</td>
                      <td className={dashboardCoreCols.category.td}>
                        <span
                          title={inc.category}
                          className={`inline-flex max-w-full items-center px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ring-inset whitespace-nowrap ${categoryRingStyle(categories.find(c => c.name === inc.category)?.color)}`}
                        >
                          <span className="truncate">{inc.category}</span>
                        </span>
                      </td>
                      <td className={dashboardCoreCols.marketplace.td}>
                        <span className="block truncate" title={inc.marketplace}>{inc.marketplace}</span>
                      </td>

                      {userRole !== 'warehouse' && (
                        <td className={dashboardCoreCols.pic.td} onClick={(e) => e.stopPropagation()}>
                          <select
                            value={inc.assigned_to || ''}
                            onChange={(e) => {
                              e.stopPropagation()
                              void handleAssigneeChange(inc.id, e.target.value)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="app-select w-full max-w-[180px] text-xs py-1.5"
                            aria-label={`Assign PIC for order ${inc.order_number}`}
                          >
                            <option value="">Unassigned</option>
                            {agents.map(a => (
                              <option key={a.id} value={a.id}>
                                {a.full_name || a.email}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}
                      
                      {tableExtraFields.map(field => {
                        const value = inc[field.key as keyof IncidentExtraDbFields]
                        return (
                          <td key={field.key} className={extraFieldCellClass(field.tableClass)}>
                            <EditableCell field={field} value={value} onSave={(newVal) => updateIncidentField(inc.id, field.key, newVal)} />
                          </td>
                        )
                      })}

                      <td className={dashboardCoreCols.status.td} onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-flex max-w-full">
                          <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${sm.select}`}>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${sm.dot}`} />
                            <span className="truncate">{inc.status}</span>
                          </div>
                          <select value={inc.status} onChange={(e) => { e.stopPropagation(); updateStatus(inc.id, e.target.value) }} onClick={(e)=>e.stopPropagation()} className="absolute inset-0 opacity-0 w-full cursor-pointer">{STATUS_VALUES.map(s => <option key={s} value={s}>{s}</option>)}</select>
                        </div>
                      </td>
                      {canDeleteCases && (
                        <td className={dashboardCoreCols.actions.td} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => void handleDeleteIncident(e, inc)}
                            disabled={deletingIncidentId === inc.id}
                            className="text-xs font-semibold text-red-700 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 px-2.5 py-1.5 rounded-md transition disabled:opacity-50"
                          >
                            {deletingIncidentId === inc.id ? '…' : 'Delete'}
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 bg-zinc-50">
              <p className="text-sm text-zinc-600">
                Page <span className="font-semibold text-zinc-900">{currentPage}</span> of {totalPages}
                <span className="text-zinc-400 mx-2">·</span>
                <span className="font-semibold text-zinc-900">{totalCount}</span> incidents
              </p>
              <div className="flex gap-2">
                <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="app-btn-secondary disabled:opacity-50">Previous</button>
                <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="app-btn-secondary disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </div>

        {showManageLists && <ManageListsModal onClose={() => setShowManageLists(false)} />}
      </div>
    </div>
  )
}