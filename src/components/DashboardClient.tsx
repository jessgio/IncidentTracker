'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '../utils/supabase/client'
import { ManageListsModal } from './ManageListsModal'
import {
  incidentExtraFields, emptyExtraFormState, extraFormToDbPayload, formatExtraValue, csvEscape,
  type ExtraFormState, type IncidentExtraDbFields, type ExtraFieldKey
} from '../lib/incident-extra-fields'

type Incident = {
  id: string; title: string; status: string; category: string; marketplace: string;
  order_number: string; complaint_date: string; created_at: string; ai_suggestion: string | null;
} & IncidentExtraDbFields

type Marketplace = { id: string; name: string }
type Category = { id: string; name: string; color: string }
type ChartStat = { name: string; count: number; percentage: number }

const colorMap: Record<string, string> = { blue: 'bg-blue-50 text-blue-800 ring-blue-300', purple: 'bg-purple-50 text-purple-800 ring-purple-300', rose: 'bg-rose-50 text-rose-800 ring-rose-300', slate: 'bg-slate-100 text-slate-800 ring-slate-300', amber: 'bg-amber-50 text-amber-800 ring-amber-300', emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-300', cyan: 'bg-cyan-50 text-cyan-800 ring-cyan-300', pink: 'bg-pink-50 text-pink-800 ring-pink-300', indigo: 'bg-indigo-50 text-indigo-800 ring-indigo-300', orange: 'bg-orange-50 text-orange-800 ring-orange-300' }
const solidColorMap: Record<string, string> = { blue: 'bg-blue-500', purple: 'bg-purple-500', rose: 'bg-rose-500', slate: 'bg-slate-600', amber: 'bg-amber-500', emerald: 'bg-emerald-500', cyan: 'bg-cyan-500', pink: 'bg-pink-500', indigo: 'bg-indigo-500', orange: 'bg-orange-500' }
const statusStyles: Record<string, { select: string; dot: string }> = { 'Not Started': { select: 'bg-rose-50 text-rose-800 border-rose-300', dot: 'bg-rose-500' }, 'In Progress': { select: 'bg-amber-50 text-amber-800 border-amber-300', dot: 'bg-amber-500' }, 'Completed': { select: 'bg-emerald-50 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' } }

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

export default function DashboardClient({ userEmail }: { userEmail: string }) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const [totalCount, setTotalCount] = useState(0)
  const [notStartedCount, setNotStartedCount] = useState(0)
  const [inProgressCount, setInProgressCount] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)
  const [categoryChart, setCategoryChart] = useState<ChartStat[]>([])
  const [marketplaceChart, setMarketplaceChart] = useState<ChartStat[]>([])

  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterMarketplace, setFilterMarketplace] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

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

  const fetchChunkedCounts = useCallback(async (from?: string, to?: string, cat?: string, mp?: string, stat?: string) => {
    const fFrom = from ?? filterFrom; const fTo = to ?? filterTo; const fCat = cat ?? filterCategory; const fMp = mp ?? filterMarketplace; const fStat = stat ?? filterStatus;
    const CHUNK = 1000; let allData: { status: string, category: string, marketplace: string }[] = []; let fromIdx = 0; let keepGoing = true;
    while (keepGoing) {
      let query = supabase.from('incidents').select('status, category, marketplace').range(fromIdx, fromIdx + CHUNK - 1)
      if (fFrom) query = query.gte('complaint_date', fFrom); if (fTo) query = query.lte('complaint_date', fTo); if (fCat) query = query.eq('category', fCat); if (fMp) query = query.eq('marketplace', fMp); if (fStat) query = query.eq('status', fStat);
      const { data } = await query; if (!data || data.length === 0) keepGoing = false; else { allData = [...allData, ...data]; if (data.length < CHUNK) keepGoing = false; else fromIdx += CHUNK }
    }
    const total = allData.length; setTotalCount(total); setNotStartedCount(allData.filter(d => d.status === 'Not Started').length); setInProgressCount(allData.filter(d => d.status === 'In Progress').length); setCompletedCount(allData.filter(d => d.status === 'Completed').length);
    const catCounts: Record<string, number> = {}; const mpCounts: Record<string, number> = {};
    allData.forEach(d => { if (d.category) catCounts[d.category] = (catCounts[d.category] || 0) + 1; if (d.marketplace) mpCounts[d.marketplace] = (mpCounts[d.marketplace] || 0) + 1 })
    setCategoryChart(Object.entries(catCounts).map(([name, count]) => ({ name, count, percentage: Math.round((count / (total||1)) * 100) })).sort((a,b) => b.count - a.count))
    setMarketplaceChart(Object.entries(mpCounts).map(([name, count]) => ({ name, count, percentage: Math.round((count / (total||1)) * 100) })).sort((a,b) => b.count - a.count))
  }, [supabase, filterFrom, filterTo, filterCategory, filterMarketplace, filterStatus])

  const fetchPage = useCallback(async (page: number, from?: string, to?: string, cat?: string, mp?: string, stat?: string) => {
    const fFrom = from ?? filterFrom; const fTo = to ?? filterTo; const fCat = cat ?? filterCategory; const fMp = mp ?? filterMarketplace; const fStat = stat ?? filterStatus;
    let countQuery = supabase.from('incidents').select('id', { count: 'exact', head: true }); if (fFrom) countQuery = countQuery.gte('complaint_date', fFrom); if (fTo) countQuery = countQuery.lte('complaint_date', fTo); if (fCat) countQuery = countQuery.eq('category', fCat); if (fMp) countQuery = countQuery.eq('marketplace', fMp); if (fStat) countQuery = countQuery.eq('status', fStat);
    const { count } = await countQuery; setTotalPages(Math.max(1, Math.ceil((count || 0) / PAGE_SIZE)))
    const start = (page - 1) * PAGE_SIZE; const end = start + PAGE_SIZE - 1
    let query = supabase.from('incidents').select('*').order('created_at', { ascending: false }).range(start, end)
    if (fFrom) query = query.gte('complaint_date', fFrom); if (fTo) query = query.lte('complaint_date', fTo); if (fCat) query = query.eq('category', fCat); if (fMp) query = query.eq('marketplace', fMp); if (fStat) query = query.eq('status', fStat);
    const { data } = await query; if (data) setIncidents(data)
  }, [supabase, filterFrom, filterTo, filterCategory, filterMarketplace, filterStatus])

  const fetchDropdowns = useCallback(async () => {
    const { data: mpData } = await supabase.from('marketplaces').select('*').order('name'); if (mpData) { setMarketplaces(mpData); if (mpData.length > 0 && !marketplace) setMarketplace(mpData[0].name) }
    const { data: catData } = await supabase.from('categories').select('*').order('name'); if (catData) { setCategories(catData); if (catData.length > 0 && !category) setCategory(catData[0].name) }
  }, [supabase])

  useEffect(() => {
    fetchPage(1); fetchChunkedCounts(); fetchDropdowns();
    const channel = supabase.channel('realtime_dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => { fetchPage(currentPage); fetchChunkedCounts() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplaces' }, fetchDropdowns)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, fetchDropdowns).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  const applyFilter = (from: string, to: string, cat: string, mp: string, stat: string) => { setFilterFrom(from); setFilterTo(to); setFilterCategory(cat); setFilterMarketplace(mp); setFilterStatus(stat); setCurrentPage(1); fetchPage(1, from, to, cat, mp, stat); fetchChunkedCounts(from, to, cat, mp, stat); }
  const handlePageChange = (page: number) => { setCurrentPage(page); fetchPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!title || !orderNumber || !complaintDate) return; setIsSubmitting(true);
    let aiSuggestion = ''
    try {
      const res = await fetch('/api/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, category, marketplace }) })
      const data = await res.json(); aiSuggestion = data.suggestion || ''
    } catch (err) {}
    await supabase.from('incidents').insert([{ title, category, marketplace, order_number: orderNumber, complaint_date: complaintDate, status: 'Not Started', ai_suggestion: aiSuggestion, ...extraFormToDbPayload(extraForm) }])
    setTitle(''); setOrderNumber(''); setExtraForm({ ...emptyExtraFormState }); setShowExtraFields(false); setIsSubmitting(false); setShowForm(false)
  }

  const handleAddMarketplace = async (name: string) => { const { error } = await supabase.from('marketplaces').insert([{ name }]); if (!error) { setMarketplace(name); setIsAddingMp(false) } else alert('Marketplace already exists.') }
  const handleAddCategory = async (name: string, color?: string) => { const { error } = await supabase.from('categories').insert([{ name, color: color || 'slate' }]); if (!error) { setCategory(name); setIsAddingCat(false) } else alert('Category already exists.') }
  
  const updateStatus = async (id: string, newStatus: string) => {
    setIncidents(prev => prev.map(inc => inc.id === id ? { ...inc, status: newStatus } : inc))
    await supabase.from('incidents').update({ status: newStatus }).eq('id', id)
  }

  const updateIncidentField = async (id: string, key: string, value: string) => {
    let finalValue: string | number | null = value === '' ? null : value
    if (['shipping_fee', 'replacement_fee', 'refund_amount'].includes(key) && finalValue !== null) {
      const parsed = Number(finalValue); finalValue = Number.isFinite(parsed) ? parsed : null
    }
    setIncidents(prev => prev.map(inc => inc.id === id ? { ...inc, [key]: finalValue } : inc))
    await supabase.from('incidents').update({ [key]: finalValue }).eq('id', id)
  }

  const getCategoryStyle = (catName: string) => colorMap[categories.find(c => c.name === catName)?.color || 'slate'] || colorMap['slate']
  const getCategorySolidColor = (catName: string) => solidColorMap[categories.find(c => c.name === catName)?.color || 'slate'] || solidColorMap['slate']

  const handleExport = async () => {
    setIsExporting(true); const CHUNK = 1000; let allRows: Incident[] = []; let fromIdx = 0; let keepGoing = true
    try {
      while (keepGoing) {
        let query = supabase.from('incidents').select('*').order('created_at', { ascending: false }).range(fromIdx, fromIdx + CHUNK - 1); if (filterFrom) query = query.gte('complaint_date', filterFrom); if (filterTo) query = query.lte('complaint_date', filterTo); if (filterCategory) query = query.eq('category', filterCategory); if (filterMarketplace) query = query.eq('marketplace', filterMarketplace); if (filterStatus) query = query.eq('status', filterStatus);
        const { data } = await query; if (!data || data.length === 0) keepGoing = false; else { allRows = [...allRows, ...data]; if (data.length < CHUNK) keepGoing = false; else fromIdx += CHUNK }
      }
      const headers = ['Title', 'Order Number', 'Date', 'Category', 'Marketplace', ...incidentExtraFields.map(f => f.label), 'Status', 'Draft Response', 'Created At']
      const csvRows = [headers.join(','), ...allRows.map(row => [csvEscape(row.title), csvEscape(row.order_number), csvEscape(row.complaint_date), csvEscape(row.category), csvEscape(row.marketplace), ...incidentExtraFields.map(f => csvEscape(row[f.key as keyof IncidentExtraDbFields])), csvEscape(row.status), csvEscape(row.ai_suggestion), csvEscape(row.created_at)].join(','))]
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `incidents-export-${new Date().toISOString().split('T')[0]}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url)
    } catch(err) { alert('Export failed. Please try again.') }
    setIsExporting(false)
  }

  const getPaginationRange = () => {
    const delta = 2; const range: (number | string)[] = []; const left = Math.max(2, currentPage - delta); const right = Math.min(totalPages - 1, currentPage + delta);
    range.push(1); if (left > 2) range.push('...'); for (let i = left; i <= right; i++) range.push(i); if (right < totalPages - 1) range.push('...'); if (totalPages > 1) range.push(totalPages); return range;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30">
      <div className="max-w-[95%] mx-auto p-4 md:p-8">

        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div><h1 className="text-4xl font-bold tracking-tight text-slate-900">Incidents</h1><p className="text-slate-600 mt-1 text-sm font-medium">Track and manage customer service complaints in real-time</p></div>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={handleExport} disabled={isExporting} className="flex items-center gap-2 text-sm font-bold bg-white/70 backdrop-blur-sm border-2 border-slate-200/70 px-4 py-2 rounded-full shadow-sm text-slate-800 hover:text-blue-700 hover:bg-white disabled:opacity-50">{isExporting ? 'Exporting...' : 'Export CSV'}</button>
            <button onClick={() => setShowManageLists(true)} className="flex items-center gap-2 text-sm font-bold bg-white/70 backdrop-blur-sm border-2 border-slate-200/70 px-4 py-2 rounded-full shadow-sm text-slate-800 hover:text-blue-700 hover:bg-white">Manage Lists</button>
            <div className="flex items-center gap-2 text-sm font-bold bg-white/70 backdrop-blur-sm border-2 border-slate-200/70 px-4 py-2 rounded-full shadow-sm"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /><span className="text-slate-800">{userEmail}</span></div>
          </div>
        </header>

        {/* FILTERS */}
        <div className="bg-white/70 backdrop-blur-sm border-2 border-slate-200/60 rounded-2xl px-6 py-4 mb-6 shadow-sm">
          <div className="flex flex-col xl:flex-row xl:items-center gap-4">
            <span className="text-sm font-bold text-slate-800">Filters</span>
            <div className="hidden xl:block w-px h-6 bg-slate-300 flex-shrink-0" />
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-100 border-2 border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2"><span className="text-xs font-bold text-slate-600">From</span><input type="date" value={filterFrom} onChange={(e) => applyFilter(e.target.value, filterTo, filterCategory, filterMarketplace, filterStatus)} className="bg-transparent text-slate-900 font-medium text-sm focus:outline-none" /></div>
              <div className="flex items-center gap-2 bg-slate-100 border-2 border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2"><span className="text-xs font-bold text-slate-600">To</span><input type="date" value={filterTo} onChange={(e) => applyFilter(filterFrom, e.target.value, filterCategory, filterMarketplace, filterStatus)} className="bg-transparent text-slate-900 font-medium text-sm focus:outline-none" /></div>
              <select value={filterStatus} onChange={(e) => applyFilter(filterFrom, filterTo, filterCategory, filterMarketplace, e.target.value)} className="bg-slate-100 border-2 border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300"><option value="">All Statuses</option><option value="Not Started">Not Started</option><option value="In Progress">In Progress</option><option value="Completed">Completed</option></select>
              <select value={filterCategory} onChange={(e) => applyFilter(filterFrom, filterTo, e.target.value, filterMarketplace, filterStatus)} className="bg-slate-100 border-2 border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300"><option value="">All Categories</option>{categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
              <select value={filterMarketplace} onChange={(e) => applyFilter(filterFrom, filterTo, filterCategory, e.target.value, filterStatus)} className="bg-slate-100 border-2 border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300"><option value="">All Marketplaces</option>{marketplaces.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}</select>
              {(filterFrom || filterTo || filterCategory || filterMarketplace || filterStatus) && (<button onClick={() => applyFilter('', '', '', '', '')} className="text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 px-4 py-2.5 rounded-xl transition shadow-sm border border-rose-600">Clear Filters</button>)}
            </div>
          </div>
        </div>

        {/* GRAPHS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="grid grid-cols-2 gap-4 lg:col-span-1">
            <div className="bg-white p-5 rounded-2xl border-2 border-slate-200 shadow-sm"><p className="text-xs font-bold text-slate-600 uppercase">Total</p><p className="text-3xl font-black text-slate-900">{totalCount}</p></div>
            <div className="bg-rose-50 p-5 rounded-2xl border-2 border-rose-200 shadow-sm"><p className="text-xs font-bold text-rose-600 uppercase">Not Started</p><p className="text-3xl font-black text-rose-800">{notStartedCount}</p></div>
            <div className="bg-amber-50 p-5 rounded-2xl border-2 border-amber-200 shadow-sm"><p className="text-xs font-bold text-amber-700 uppercase">In Progress</p><p className="text-3xl font-black text-amber-900">{inProgressCount}</p></div>
            <div className="bg-emerald-50 p-5 rounded-2xl border-2 border-emerald-200 shadow-sm"><p className="text-xs font-bold text-emerald-700 uppercase">Completed</p><p className="text-3xl font-black text-emerald-900">{completedCount}</p></div>
          </div>
          <div className="bg-white/90 p-6 rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col"><h3 className="text-sm font-bold text-slate-900 mb-4">By Marketplace</h3>{totalCount===0?<p className="text-sm text-slate-500 font-medium">No data</p>:<div className="space-y-4 overflow-y-auto max-h-[160px] pr-2">{marketplaceChart.map(mp => <div key={mp.name}><div className="flex justify-between text-xs mb-1 font-bold text-slate-800"><span>{mp.name}</span><span>{mp.count} ({mp.percentage}%)</span></div><div className="w-full bg-slate-200 rounded-full h-2.5"><div className="bg-slate-700 h-2.5 rounded-full" style={{ width: `${mp.percentage}%` }}></div></div></div>)}</div>}</div>
          <div className="bg-white/90 p-6 rounded-2xl border-2 border-slate-200 shadow-sm flex flex-col"><h3 className="text-sm font-bold text-slate-900 mb-4">By Category</h3>{totalCount===0?<p className="text-sm text-slate-500 font-medium">No data</p>:<div className="space-y-4 overflow-y-auto max-h-[160px] pr-2">{categoryChart.map(cat => <div key={cat.name}><div className="flex justify-between text-xs mb-1 font-bold text-slate-800"><span>{cat.name}</span><span>{cat.count} ({cat.percentage}%)</span></div><div className="w-full bg-slate-200 rounded-full h-2.5"><div className={`h-2.5 rounded-full ${getCategorySolidColor(cat.name)}`} style={{ width: `${cat.percentage}%` }}></div></div></div>)}</div>}</div>
        </div>

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
                    {isAddingCat ? <InlineAdd onCancel={() => setIsAddingCat(false)} onAdd={handleAddCategory} extraField={{ label: 'Color', options: Object.keys(colorMap) }} placeholder="Name" /> : 
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
        <div className="px-6 py-3 border-b border-slate-200 bg-white text-xs font-bold text-slate-500 rounded-t-2xl border-x border-t">💡 Tip: Click any cell to edit it directly, or scroll horizontally. Use pagination at the bottom to view more.</div>
        <div className="bg-white rounded-b-2xl shadow-sm border border-slate-200 overflow-hidden relative">
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[3600px] border-collapse">
              <thead className="bg-slate-100 border-b-2 border-slate-200">
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-100 text-left px-5 py-4 text-xs font-bold text-slate-600 uppercase tracking-widest w-[240px] min-w-[240px]">Incident</th>
                  <th className="sticky left-[240px] z-20 bg-slate-100 text-left px-5 py-4 text-xs font-bold text-slate-600 uppercase tracking-widest w-[160px] min-w-[160px] border-r-2 border-slate-200 shadow-[4px_0_10px_-3px_rgba(0,0,0,0.1)]">Order #</th>
                  {['Date', 'Category', 'Marketplace'].map(h => <th key={h} className="text-left px-5 py-4 text-xs font-bold text-slate-600 uppercase tracking-widest whitespace-nowrap">{h}</th>)}
                  {incidentExtraFields.map(f => <th key={f.key} className="text-left px-5 py-4 text-xs font-bold text-slate-600 uppercase tracking-widest whitespace-nowrap">{f.label}</th>)}
                  {['Status', 'Draft Response'].map(h => <th key={h} className="text-left px-5 py-4 text-xs font-bold text-slate-600 uppercase tracking-widest">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {incidents.length === 0 ? <tr><td colSpan={7 + incidentExtraFields.length} className="p-10 text-center font-medium text-slate-500">No incidents found</td></tr> : 
                incidents.map(inc => {
                  const sStyle = statusStyles[inc.status] || statusStyles['Not Started']
                  return (
                    <tr key={inc.id} onClick={() => window.location.href = `/incidents/${inc.id}`} className="group hover:bg-blue-50 transition cursor-pointer">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-blue-50 transition-colors px-5 py-4 w-[240px] min-w-[240px] align-top"><p className="font-bold text-slate-900 text-sm leading-relaxed">{inc.title}</p></td>
                      <td className="sticky left-[240px] z-10 bg-white group-hover:bg-blue-50 transition-colors px-5 py-4 w-[160px] min-w-[160px] align-top border-r-2 border-slate-100 shadow-[4px_0_10px_-3px_rgba(0,0,0,0.05)]"><span className="font-mono text-xs font-bold bg-slate-200 text-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-300">#{inc.order_number}</span></td>
                      
                      <td className="px-5 py-4 text-sm font-medium text-slate-700 whitespace-nowrap align-top">{inc.complaint_date ? new Date(inc.complaint_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                      <td className="px-5 py-4 align-top"><span className={`px-3 py-1.5 rounded-full text-xs font-bold ring-1 ring-inset ${getCategoryStyle(inc.category)}`}>{inc.category}</span></td>
                      <td className="px-5 py-4 text-sm font-bold text-slate-800 whitespace-nowrap align-top">{inc.marketplace}</td>
                      
                      {incidentExtraFields.map(field => {
                        const value = inc[field.key as keyof IncidentExtraDbFields]
                        return (
                          <td key={field.key} className={`px-3 py-2 align-top ${field.tableClass ?? 'min-w-[140px]'}`}>
                            <EditableCell field={field} value={value} onSave={(newVal) => updateIncidentField(inc.id, field.key, newVal)} />
                          </td>
                        )
                      })}

                      <td className="px-5 py-4 whitespace-nowrap align-top" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border-2 ${sStyle.select}`}><span className={`w-2 h-2 rounded-full flex-shrink-0 ${sStyle.dot}`} />{inc.status}</div>
                          <select value={inc.status} onChange={(e) => { e.stopPropagation(); updateStatus(inc.id, e.target.value) }} onClick={(e)=>e.stopPropagation()} className="absolute inset-0 opacity-0 w-full cursor-pointer"><option>Not Started</option><option>In Progress</option><option>Completed</option></select>
                        </div>
                      </td>
                      <td className="px-5 py-4 w-[300px] align-top" onClick={(e) => e.stopPropagation()}>{inc.ai_suggestion ? <div className="flex items-start gap-2 bg-violet-50 p-3 rounded-xl border border-violet-100"><p className="text-xs font-medium text-slate-700 leading-relaxed"><span className="text-violet-600 font-black mr-1">❖</span>{inc.ai_suggestion}</p></div> : <span className="text-xs text-slate-400 font-medium italic">No draft response generated</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t-2 border-slate-200 bg-slate-100">
              <p className="text-sm font-bold text-slate-600">Page <span className="text-slate-900">{currentPage}</span> of {totalPages} <span className="text-slate-400 mx-2">|</span> <span className="text-slate-900">{totalCount}</span> total incidents</p>
              <div className="flex gap-2">
                <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="px-4 py-2 bg-white border-2 border-slate-300 font-bold rounded-xl text-sm text-slate-800 hover:border-slate-400 disabled:opacity-50 transition shadow-sm">← Prev</button>
                {getPaginationRange().map((page, idx) => page === '...' ? <span key={`ellipsis-${idx}`} className="px-2 font-bold text-slate-400">...</span> : <button key={page} onClick={() => handlePageChange(page as number)} className={`w-9 h-9 font-bold rounded-xl border-2 transition ${currentPage === page ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400'}`}>{page}</button>)}
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