'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '../utils/supabase/client'
import { ManageListsModal } from './ManageListsModal'

// --- TYPES ---
type Incident = {
  id: string; title: string; status: string; category: string; marketplace: string;
  order_number: string; complaint_date: string; created_at: string; ai_suggestion: string | null;
}
type Marketplace = { id: string; name: string }
type Category = { id: string; name: string; color: string }
type ChartStat = { name: string; count: number; percentage: number; colorKey?: string }

// --- CONSTANTS ---
const colorMap: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-200', purple: 'bg-purple-50 text-purple-700 ring-purple-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200', slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200', emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-200', pink: 'bg-pink-50 text-pink-700 ring-pink-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200', orange: 'bg-orange-50 text-orange-700 ring-orange-200',
}

const solidColorMap: Record<string, string> = {
  blue: 'bg-blue-500', purple: 'bg-purple-500', rose: 'bg-rose-500', slate: 'bg-slate-500',
  amber: 'bg-amber-500', emerald: 'bg-emerald-500', cyan: 'bg-cyan-500', pink: 'bg-pink-500',
  indigo: 'bg-indigo-500', orange: 'bg-orange-500',
}

const statusStyles: Record<string, { select: string; dot: string }> = {
  'Not Started': { select: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-400' },
  'In Progress': { select: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
  'Completed':   { select: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-400' },
}

// Inline Add Widget
function InlineAdd({ onAdd, onCancel, placeholder, extraField }: any) {
  const [name, setName] = useState('')
  const [extra, setExtra] = useState(extraField?.options[0]?.value || '')
  return (
    <div className="flex gap-1.5 items-center flex-wrap">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (name) onAdd(name, extra) } if (e.key === 'Escape') onCancel() }} className="flex-1 min-w-0 bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200" placeholder={placeholder} />
      {extraField && <select value={extra} onChange={(e) => setExtra(e.target.value)} className="bg-slate-50 border border-slate-200 px-2 py-2.5 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer">{extraField.options.map((o:any) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
      <button type="button" onClick={() => { if (name) onAdd(name, extra) }} className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-3 py-2.5 rounded-xl text-sm font-medium transition">✓</button>
      <button type="button" onClick={onCancel} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2.5 rounded-xl text-sm transition">✕</button>
    </div>
  )
}

const PAGE_SIZE = 25

export default function DashboardClient({ userEmail }: { userEmail: string }) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  // Totals
  const [totalCount, setTotalCount] = useState(0)
  const [notStartedCount, setNotStartedCount] = useState(0)
  const [inProgressCount, setInProgressCount] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)
  
  // Charts
  const [categoryChart, setCategoryChart] = useState<ChartStat[]>([])
  const [marketplaceChart, setMarketplaceChart] = useState<ChartStat[]>([])

  // Pagination & Filters
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterMarketplace, setFilterMarketplace] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Form & UI states
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [marketplace, setMarketplace] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [complaintDate, setComplaintDate] = useState(new Date().toISOString().split('T')[0])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [isAddingMp, setIsAddingMp] = useState(false)
  const [isAddingCat, setIsAddingCat] = useState(false)
  const [showManageLists, setShowManageLists] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const supabase = createClient()

  const fetchChunkedCounts = useCallback(async (from?: string, to?: string, cat?: string, mp?: string, stat?: string) => {
    const fFrom = from ?? filterFrom
    const fTo = to ?? filterTo
    const fCat = cat ?? filterCategory
    const fMp = mp ?? filterMarketplace
    const fStat = stat ?? filterStatus

    const CHUNK = 1000
    let allData: { status: string, category: string, marketplace: string }[] = []
    let fromIdx = 0
    let keepGoing = true

    while (keepGoing) {
      let query = supabase.from('incidents').select('status, category, marketplace').range(fromIdx, fromIdx + CHUNK - 1)
      if (fFrom) query = query.gte('complaint_date', fFrom)
      if (fTo) query = query.lte('complaint_date', fTo)
      if (fCat) query = query.eq('category', fCat)
      if (fMp) query = query.eq('marketplace', fMp)
      if (fStat) query = query.eq('status', fStat) 

      const { data } = await query
      if (!data || data.length === 0) {
        keepGoing = false
      } else {
        allData = [...allData, ...data]
        if (data.length < CHUNK) keepGoing = false
        else fromIdx += CHUNK
      }
    }

    const total = allData.length
    setTotalCount(total)
    setNotStartedCount(allData.filter(d => d.status === 'Not Started').length)
    setInProgressCount(allData.filter(d => d.status === 'In Progress').length)
    setCompletedCount(allData.filter(d => d.status === 'Completed').length)

    // Calculate Chart Aggregations
    const catCounts: Record<string, number> = {}
    const mpCounts: Record<string, number> = {}
    allData.forEach(d => {
      if (d.category) catCounts[d.category] = (catCounts[d.category] || 0) + 1
      if (d.marketplace) mpCounts[d.marketplace] = (mpCounts[d.marketplace] || 0) + 1
    })

    const safeTotal = total || 1; // avoid division by zero
    setCategoryChart(Object.entries(catCounts).map(([name, count]) => ({
      name, count, percentage: Math.round((count / safeTotal) * 100)
    })).sort((a,b) => b.count - a.count))

    setMarketplaceChart(Object.entries(mpCounts).map(([name, count]) => ({
      name, count, percentage: Math.round((count / safeTotal) * 100)
    })).sort((a,b) => b.count - a.count))

  }, [supabase, filterFrom, filterTo, filterCategory, filterMarketplace, filterStatus])

  const fetchPage = useCallback(async (page: number, from?: string, to?: string, cat?: string, mp?: string, stat?: string) => {
    const fFrom = from ?? filterFrom
    const fTo = to ?? filterTo
    const fCat = cat ?? filterCategory
    const fMp = mp ?? filterMarketplace
    const fStat = stat ?? filterStatus

    let countQuery = supabase.from('incidents').select('id', { count: 'exact', head: true })
    if (fFrom) countQuery = countQuery.gte('complaint_date', fFrom)
    if (fTo) countQuery = countQuery.lte('complaint_date', fTo)
    if (fCat) countQuery = countQuery.eq('category', fCat)
    if (fMp) countQuery = countQuery.eq('marketplace', fMp)
    if (fStat) countQuery = countQuery.eq('status', fStat)

    const { count } = await countQuery
    setTotalPages(Math.max(1, Math.ceil((count || 0) / PAGE_SIZE)))

    const start = (page - 1) * PAGE_SIZE
    const end = start + PAGE_SIZE - 1
    let query = supabase.from('incidents').select('*').order('created_at', { ascending: false }).range(start, end)
    if (fFrom) query = query.gte('complaint_date', fFrom)
    if (fTo) query = query.lte('complaint_date', fTo)
    if (fCat) query = query.eq('category', fCat)
    if (fMp) query = query.eq('marketplace', fMp)
    if (fStat) query = query.eq('status', fStat)

    const { data } = await query
    if (data) setIncidents(data)
  }, [supabase, filterFrom, filterTo, filterCategory, filterMarketplace, filterStatus])

  const fetchDropdowns = useCallback(async () => {
    const { data: mpData } = await supabase.from('marketplaces').select('*').order('name')
    if (mpData) { setMarketplaces(mpData); if (mpData.length > 0 && !marketplace) setMarketplace(mpData[0].name) }
    const { data: catData } = await supabase.from('categories').select('*').order('name')
    if (catData) { setCategories(catData); if (catData.length > 0 && !category) setCategory(catData[0].name) }
  }, [supabase])

  useEffect(() => {
    fetchPage(1)
    fetchChunkedCounts()
    fetchDropdowns()
    const channel = supabase.channel('realtime_dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => { fetchPage(currentPage); fetchChunkedCounts() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplaces' }, fetchDropdowns)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, fetchDropdowns)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  const applyFilter = (from: string, to: string, cat: string, mp: string, stat: string) => {
    setFilterFrom(from); setFilterTo(to); setFilterCategory(cat); setFilterMarketplace(mp); setFilterStatus(stat);
    setCurrentPage(1); fetchPage(1, from, to, cat, mp, stat); fetchChunkedCounts(from, to, cat, mp, stat);
  }

  const handlePageChange = (page: number) => { setCurrentPage(page); fetchPage(page); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || !orderNumber || !complaintDate) return
    setIsSubmitting(true)
    let aiSuggestion = ''
    try {
      const res = await fetch('/api/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, category, marketplace }) })
      const data = await res.json()
      aiSuggestion = data.suggestion || ''
    } catch (err) { console.error('Could not get AI suggestion:', err) }

    await supabase.from('incidents').insert([{ title, category, marketplace, order_number: orderNumber, complaint_date: complaintDate, status: 'Not Started', ai_suggestion: aiSuggestion }])
    setTitle(''); setOrderNumber(''); setIsSubmitting(false); setShowForm(false)
  }

  const handleAddMarketplace = async (name: string) => {
    const { error } = await supabase.from('marketplaces').insert([{ name }])
    if (!error) { setMarketplace(name); setIsAddingMp(false) } else alert('Marketplace already exists.')
  }

  const handleAddCategory = async (name: string, color?: string) => {
    const { error } = await supabase.from('categories').insert([{ name, color: color || 'slate' }])
    if (!error) { setCategory(name); setIsAddingCat(false) } else alert('Category already exists.')
  }

  const updateStatus = async (id: string, newStatus: string) => {
    setIncidents(prev => prev.map(inc => inc.id === id ? { ...inc, status: newStatus } : inc))
    await supabase.from('incidents').update({ status: newStatus }).eq('id', id)
  }

  const getCategoryStyle = (catName: string) => {
    const found = categories.find(c => c.name === catName)
    return colorMap[found?.color || 'slate'] || colorMap['slate']
  }
  const getCategorySolidColor = (catName: string) => {
    const found = categories.find(c => c.name === catName)
    return solidColorMap[found?.color || 'slate'] || solidColorMap['slate']
  }

  const handleExport = async () => {
    setIsExporting(true)
    const CHUNK = 1000; let allRows: Incident[] = []; let fromIdx = 0; let keepGoing = true
    try {
      while (keepGoing) {
        let query = supabase.from('incidents').select('*').order('created_at', { ascending: false }).range(fromIdx, fromIdx + CHUNK - 1)
        if (filterFrom) query = query.gte('complaint_date', filterFrom)
        if (filterTo) query = query.lte('complaint_date', filterTo)
        if (filterCategory) query = query.eq('category', filterCategory)
        if (filterMarketplace) query = query.eq('marketplace', filterMarketplace)
        if (filterStatus) query = query.eq('status', filterStatus)
        const { data } = await query
        if (!data || data.length === 0) keepGoing = false
        else { allRows = [...allRows, ...data]; if (data.length < CHUNK) keepGoing = false; else fromIdx += CHUNK }
      }
      const headers = ['Title', 'Order Number', 'Date', 'Category', 'Marketplace', 'Status', 'AI Suggestion', 'Created At']
      const csvRows = [headers.join(','), ...allRows.map(row => [`"${(row.title || '').replace(/"/g, '""')}"`, `"${row.order_number || ''}"`, `"${row.complaint_date || ''}"`, `"${row.category || ''}"`, `"${row.marketplace || ''}"`, `"${row.status || ''}"`, `"${(row.ai_suggestion || '').replace(/"/g, '""')}"`, `"${row.created_at || ''}"`].join(','))]
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `incidents-export-${new Date().toISOString().split('T')[0]}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url)
    } catch(err) { alert('Export failed. Please try again.') }
    setIsExporting(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30">
      <div className="max-w-7xl mx-auto p-6 md:p-10">

        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div><h1 className="text-4xl font-bold tracking-tight text-slate-900">Incidents</h1><p className="text-slate-500 mt-1 text-sm">Track and manage customer service complaints in real-time</p></div>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={handleExport} disabled={isExporting} className="flex items-center gap-2 text-sm bg-white/70 backdrop-blur-sm border border-slate-200/70 px-4 py-2 rounded-full shadow-sm text-slate-600 hover:text-slate-900 hover:bg-white transition disabled:opacity-50">{isExporting ? 'Exporting...' : 'Export CSV'}</button>
            <button onClick={() => setShowManageLists(true)} className="flex items-center gap-2 text-sm bg-white/70 backdrop-blur-sm border border-slate-200/70 px-4 py-2 rounded-full shadow-sm text-slate-600 hover:text-slate-900 hover:bg-white transition">Manage Lists</button>
            <div className="flex items-center gap-2 text-sm bg-white/70 backdrop-blur-sm border border-slate-200/70 px-4 py-2 rounded-full shadow-sm"><div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" /><span className="text-slate-600 font-medium">{userEmail}</span></div>
          </div>
        </header>

        {/* FILTERS */}
        <div className="bg-white/70 backdrop-blur-sm border border-slate-200/60 rounded-2xl px-6 py-4 mb-6 shadow-sm">
          <div className="flex flex-col xl:flex-row xl:items-center gap-4">
            <div className="flex items-center gap-2 flex-shrink-0"><span className="text-sm font-semibold text-slate-600 whitespace-nowrap">Filter</span></div>
            <div className="hidden xl:block w-px h-6 bg-slate-200 flex-shrink-0" />
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"><span className="text-xs font-semibold text-slate-400">From</span><input type="date" value={filterFrom} onChange={(e) => applyFilter(e.target.value, filterTo, filterCategory, filterMarketplace, filterStatus)} className="bg-transparent text-slate-800 text-sm focus:outline-none" /></div>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"><span className="text-xs font-semibold text-slate-400">To</span><input type="date" value={filterTo} onChange={(e) => applyFilter(filterFrom, e.target.value, filterCategory, filterMarketplace, filterStatus)} className="bg-transparent text-slate-800 text-sm focus:outline-none" /></div>
              <select value={filterStatus} onChange={(e) => applyFilter(filterFrom, filterTo, filterCategory, filterMarketplace, e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none"><option value="">All Statuses</option><option value="Not Started">Not Started</option><option value="In Progress">In Progress</option><option value="Completed">Completed</option></select>
              <select value={filterCategory} onChange={(e) => applyFilter(filterFrom, filterTo, e.target.value, filterMarketplace, filterStatus)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none"><option value="">All Categories</option>{categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
              <select value={filterMarketplace} onChange={(e) => applyFilter(filterFrom, filterTo, filterCategory, e.target.value, filterStatus)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none"><option value="">All Marketplaces</option>{marketplaces.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}</select>
              {(filterFrom || filterTo || filterCategory || filterMarketplace || filterStatus) && (<button onClick={() => applyFilter('', '', '', '', '')} className="text-xs font-medium text-rose-500 bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl">Clear Filter</button>)}
            </div>
          </div>
        </div>

        {/* GRAPHS AND STATS ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          
          {/* STAT NUMBER CARDS (Takes up 1/3 space on large screens, grid of 4) */}
          <div className="grid grid-cols-2 gap-4 lg:col-span-1">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm"><p className="text-xs font-semibold text-slate-500 uppercase mb-1">Total</p><p className="text-3xl font-bold text-slate-800">{totalCount}</p></div>
            <div className="bg-rose-50/50 p-5 rounded-2xl border border-rose-100 shadow-sm"><p className="text-xs font-semibold text-rose-500 uppercase mb-1">Not Started</p><p className="text-3xl font-bold text-rose-700">{notStartedCount}</p></div>
            <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-100 shadow-sm"><p className="text-xs font-semibold text-amber-500 uppercase mb-1">In Progress</p><p className="text-3xl font-bold text-amber-700">{inProgressCount}</p></div>
            <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 shadow-sm"><p className="text-xs font-semibold text-emerald-500 uppercase mb-1">Completed</p><p className="text-3xl font-bold text-emerald-700">{completedCount}</p></div>
          </div>

          {/* MARKETPLACE DISTRIBUTION CHART */}
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col">
            <h3 className="text-sm font-bold text-slate-800 mb-4">By Marketplace</h3>
            {totalCount === 0 ? <p className="text-sm text-slate-400 italic">No data</p> : (
              <div className="space-y-4 flex-1 overflow-y-auto max-h-[160px] pr-2">
                {marketplaceChart.map(mp => (
                  <div key={mp.name}>
                    <div className="flex justify-between text-xs mb-1 font-medium">
                      <span className="text-slate-700">{mp.name}</span>
                      <span className="text-slate-500">{mp.count} ({mp.percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className="bg-slate-800 h-2 rounded-full transition-all duration-500" style={{ width: `${mp.percentage}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CATEGORY DISTRIBUTION CHART */}
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/60 shadow-sm flex flex-col">
            <h3 className="text-sm font-bold text-slate-800 mb-4">By Category</h3>
            {totalCount === 0 ? <p className="text-sm text-slate-400 italic">No data</p> : (
              <div className="space-y-4 flex-1 overflow-y-auto max-h-[160px] pr-2">
                {categoryChart.map(cat => (
                  <div key={cat.name}>
                    <div className="flex justify-between text-xs mb-1 font-medium">
                      <span className="text-slate-700">{cat.name}</span>
                      <span className="text-slate-500">{cat.count} ({cat.percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className={`h-2 rounded-full transition-all duration-500 ${getCategorySolidColor(cat.name)}`} style={{ width: `${cat.percentage}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* LOG INCIDENT FORM ... */}
        <div className="mb-8">
          {!showForm ? (
            <button onClick={() => setShowForm(true)} className="group bg-white hover:bg-blue-50 border-dashed border border-slate-300 text-slate-600 px-6 py-4 rounded-2xl w-full flex items-center justify-center gap-2 font-medium shadow-sm transition"><span className="text-xl">+</span> Log New Incident</button>
          ) : (
            <div className="bg-white p-7 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-5"><h2 className="text-lg font-bold">New Incident</h2><button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button></div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Description</label><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-slate-900 border-slate-300" required /></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Order #</label><input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-slate-900 border-slate-300" required /></div>
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Date</label><input type="date" value={complaintDate} onChange={(e) => setComplaintDate(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-slate-900 border-slate-300" required /></div>
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Category</label>
                    {isAddingCat ? <InlineAdd onCancel={() => setIsAddingCat(false)} onAdd={handleAddCategory} extraField={{ label: 'Color', options: Object.keys(colorMap).map(c=>({label:c,value:c})) }} placeholder="Name" /> : 
                    <div className="flex gap-1"><select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-slate-900 border-slate-300"><option value="">Select...</option>{categories.map(c=><option key={c.name} value={c.name}>{c.name}</option>)}</select><button type="button" onClick={() => setIsAddingCat(true)} className="bg-slate-100 px-3 rounded-xl">+</button></div>}
                  </div>
                  <div><label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Marketplace</label>
                    {isAddingMp ? <InlineAdd onCancel={() => setIsAddingMp(false)} onAdd={handleAddMarketplace} placeholder="Name" /> : 
                    <div className="flex gap-1"><select value={marketplace} onChange={(e) => setMarketplace(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-slate-900 border-slate-300"><option value="">Select...</option>{marketplaces.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}</select><button type="button" onClick={() => setIsAddingMp(true)} className="bg-slate-100 px-3 rounded-xl">+</button></div>}
                  </div>
                </div>
                <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600">Cancel</button><button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white px-5 py-2 rounded-xl disabled:bg-slate-300">{isSubmitting ? 'Saving...' : 'Save Incident'}</button></div>
              </form>
            </div>
          )}
        </div>

        {/* TABLE */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-50/60 border-b border-slate-100">
                <tr>
                  {['Incident', 'Order #', 'Date', 'Category', 'Marketplace', 'Status', 'AI Suggestion'].map(h => <th key={h} className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {incidents.length === 0 ? <tr><td colSpan={7} className="p-10 text-center text-slate-400">No incidents found</td></tr> : 
                incidents.map(inc => {
                  const sStyle = statusStyles[inc.status] || statusStyles['Not Started']
                  return (
                    <tr key={inc.id} onClick={() => window.location.href = `/incidents/${inc.id}`} className="hover:bg-blue-50/30 transition cursor-pointer">
                      <td className="px-6 py-4 w-[220px]"><p className="font-medium text-slate-800 text-sm leading-relaxed">{inc.title}</p></td>
                      <td className="px-6 py-4"><span className="font-mono text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg">#{inc.order_number}</span></td>
                      <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">{inc.complaint_date ? new Date(inc.complaint_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                      <td className="px-6 py-4"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset ${getCategoryStyle(inc.category)}`}>{inc.category}</span></td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{inc.marketplace}</td>
                      <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${sStyle.select}`}><span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sStyle.dot}`} />{inc.status}</div>
                          <select value={inc.status} onChange={(e) => updateStatus(inc.id, e.target.value)} onClick={(e)=>e.stopPropagation()} className="absolute inset-0 opacity-0 w-full cursor-pointer"><option>Not Started</option><option>In Progress</option><option>Completed</option></select>
                        </div>
                      </td>
                      <td className="px-6 py-4 w-[280px]" onClick={(e) => e.stopPropagation()}>{inc.ai_suggestion ? <div className="flex items-start gap-2"><p className="text-xs text-slate-500 leading-relaxed"><span className="text-violet-500 font-bold mr-1">❖</span>{inc.ai_suggestion}</p></div> : <span className="text-xs text-slate-300 italic">No suggestion</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50/40">
              <p className="text-xs text-slate-500">Page <span className="font-bold text-slate-700">{currentPage}</span> of {totalPages} · <span className="font-bold">{totalCount}</span> total</p>
              <div className="flex gap-1">
                <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-sm disabled:opacity-50">←</button>
                <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-sm disabled:opacity-50">→</button>
              </div>
            </div>
          )}
        </div>

        {showManageLists && <ManageListsModal onClose={() => setShowManageLists(false)} />}
      </div>
    </div>
  )
}