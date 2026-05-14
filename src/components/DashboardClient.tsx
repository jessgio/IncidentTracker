'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '../utils/supabase/client'
import { ManageListsModal } from './ManageListsModal'

// Types
type Incident = {
  id: string
  title: string
  status: string
  category: string
  marketplace: string
  order_number: string
  complaint_date: string
  created_at: string
  ai_suggestion: string | null
}

type Marketplace = { id: string; name: string }
type Category = { id: string; name: string; color: string }

const colorMap: Record<string, string> = {
  blue:    'bg-blue-50 text-blue-700 ring-blue-200',
  purple:  'bg-purple-50 text-purple-700 ring-purple-200',
  rose:    'bg-rose-50 text-rose-700 ring-rose-200',
  slate:   'bg-slate-100 text-slate-700 ring-slate-200',
  amber:   'bg-amber-50 text-amber-700 ring-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cyan:    'bg-cyan-50 text-cyan-700 ring-cyan-200',
  pink:    'bg-pink-50 text-pink-700 ring-pink-200',
  indigo:  'bg-indigo-50 text-indigo-700 ring-indigo-200',
  orange:  'bg-orange-50 text-orange-700 ring-orange-200',
}

const statusStyles: Record<string, { select: string; dot: string }> = {
  'Not Started': { select: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-400' },
  'In Progress': { select: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
  'Completed':   { select: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-400' },
}

// Inline Add Widget
function InlineAdd({
  onAdd, onCancel, placeholder, extraField,
}: {
  onAdd: (name: string, extra?: string) => void
  onCancel: () => void
  placeholder: string
  extraField?: { label: string; options: { value: string; label: string }[] }
}) {
  const [name, setName] = useState('')
  const [extra, setExtra] = useState(extraField?.options[0]?.value || '')
  return (
    <div className="flex gap-1.5 items-center flex-wrap">
      <input
        autoFocus value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); if (name) onAdd(name, extra) }
          if (e.key === 'Escape') onCancel()
        }}
        className="flex-1 min-w-0 bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
        placeholder={placeholder}
      />
      {extraField && (
        <select value={extra} onChange={(e) => setExtra(e.target.value)}
          className="bg-slate-50 border border-slate-200 px-2 py-2.5 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer">
          {extraField.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      <button type="button" onClick={() => { if (name) onAdd(name, extra) }}
        className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-3 py-2.5 rounded-xl text-sm font-medium transition">✓</button>
      <button type="button" onClick={onCancel}
        className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2.5 rounded-xl text-sm transition">✕</button>
    </div>
  )
}

const PAGE_SIZE = 25

export default function DashboardClient({ userEmail }: { userEmail: string }) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  // Totals (chunked from full DB count)
  const [totalCount, setTotalCount] = useState(0)
  const [notStartedCount, setNotStartedCount] = useState(0)
  const [inProgressCount, setInProgressCount] = useState(0)
  const [completedCount, setCompletedCount] = useState(0)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // Filters
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterMarketplace, setFilterMarketplace] = useState('')
  const [filterStatus, setFilterStatus] = useState('') // <-- NEW FILTER

  // Form state
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [marketplace, setMarketplace] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [complaintDate, setComplaintDate] = useState(new Date().toISOString().split('T')[0])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // UI state
  const [showForm, setShowForm] = useState(false)
  const [isAddingMp, setIsAddingMp] = useState(false)
  const [isAddingCat, setIsAddingCat] = useState(false)
  const [showManageLists, setShowManageLists] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const supabase = createClient()

  // Chunked count fetcher
  const fetchChunkedCounts = useCallback(async (from?: string, to?: string, cat?: string, mp?: string, stat?: string) => {
    const fFrom = from ?? filterFrom
    const fTo = to ?? filterTo
    const fCat = cat ?? filterCategory
    const fMp = mp ?? filterMarketplace
    const fStat = stat ?? filterStatus // <-- NEW FILTER

    const CHUNK = 1000
    let allData: { status: string }[] = []
    let fromIdx = 0
    let keepGoing = true

    while (keepGoing) {
      let query = supabase.from('incidents').select('status').range(fromIdx, fromIdx + CHUNK - 1)
      
      if (fFrom) query = query.gte('complaint_date', fFrom)
      if (fTo) query = query.lte('complaint_date', fTo)
      if (fCat) query = query.eq('category', fCat)
      if (fMp) query = query.eq('marketplace', fMp)
      // filter status if requested (otherwise we keep it open to show correct stat breakdown)
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

    setTotalCount(allData.length)
    setNotStartedCount(allData.filter(d => d.status === 'Not Started').length)
    setInProgressCount(allData.filter(d => d.status === 'In Progress').length)
    setCompletedCount(allData.filter(d => d.status === 'Completed').length)
  }, [supabase, filterFrom, filterTo, filterCategory, filterMarketplace, filterStatus])

  // Fetch one page of incidents
  const fetchPage = useCallback(async (page: number, from?: string, to?: string, cat?: string, mp?: string, stat?: string) => {
    const fFrom = from ?? filterFrom
    const fTo = to ?? filterTo
    const fCat = cat ?? filterCategory
    const fMp = mp ?? filterMarketplace
    const fStat = stat ?? filterStatus

    // Get total count for pagination math
    let countQuery = supabase.from('incidents').select('id', { count: 'exact', head: true })
    if (fFrom) countQuery = countQuery.gte('complaint_date', fFrom)
    if (fTo) countQuery = countQuery.lte('complaint_date', fTo)
    if (fCat) countQuery = countQuery.eq('category', fCat)
    if (fMp) countQuery = countQuery.eq('marketplace', fMp)
    if (fStat) countQuery = countQuery.eq('status', fStat)

    const { count } = await countQuery
    setTotalPages(Math.max(1, Math.ceil((count || 0) / PAGE_SIZE)))

    // Fetch the actual page
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

  // Fetch dropdown data
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

    const channel = supabase
      .channel('realtime_dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => {
        fetchPage(currentPage)
        fetchChunkedCounts()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplaces' }, fetchDropdowns)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, fetchDropdowns)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  // unified filter applier
  const applyFilter = (from: string, to: string, cat: string, mp: string, stat: string) => {
    setFilterFrom(from)
    setFilterTo(to)
    setFilterCategory(cat)
    setFilterMarketplace(mp)
    setFilterStatus(stat)
    setCurrentPage(1)
    fetchPage(1, from, to, cat, mp, stat)
    fetchChunkedCounts(from, to, cat, mp, stat)
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    fetchPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || !orderNumber || !complaintDate) return
    setIsSubmitting(true)

    let aiSuggestion = ''
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, marketplace }),
      })
      const data = await res.json()
      aiSuggestion = data.suggestion || ''
    } catch (err) {
      console.error('Could not get AI suggestion:', err)
    }

    await supabase.from('incidents').insert([{
      title, category, marketplace,
      order_number: orderNumber,
      complaint_date: complaintDate,
      status: 'Not Started',
      ai_suggestion: aiSuggestion,
    }])

    setTitle('')
    setOrderNumber('')
    setIsSubmitting(false)
    setShowForm(false)
  }

  const handleAddMarketplace = async (name: string) => {
    const { error } = await supabase.from('marketplaces').insert([{ name }])
    if (!error) { setMarketplace(name); setIsAddingMp(false) }
    else alert('Marketplace already exists.')
  }

  const handleAddCategory = async (name: string, color?: string) => {
    const { error } = await supabase.from('categories').insert([{ name, color: color || 'slate' }])
    if (!error) { setCategory(name); setIsAddingCat(false) }
    else alert('Category already exists.')
  }

  const updateStatus = async (id: string, newStatus: string) => {
    // 1. Optimistic UI update (instantly changes the dropdown on screen)
    setIncidents(prevIncidents => 
      prevIncidents.map(inc => 
        inc.id === id ? { ...inc, status: newStatus } : inc
      )
    )

    // 2. Database update (happens in the background)
    await supabase.from('incidents').update({ status: newStatus }).eq('id', id)
  }

  const getCategoryStyle = (catName: string) => {
    const found = categories.find(c => c.name === catName)
    return colorMap[found?.color || 'slate'] || colorMap['slate']
  }

  const handleExport = async () => {
    setIsExporting(true)
    const CHUNK = 1000
    let allRows: Incident[] = []
    let from = 0
    let keepGoing = true

    try {
      while (keepGoing) {
        let query = supabase.from('incidents').select('*').order('created_at', { ascending: false }).range(from, from + CHUNK - 1)
        if (filterFrom) query = query.gte('complaint_date', filterFrom)
        if (filterTo) query = query.lte('complaint_date', filterTo)
        if (filterCategory) query = query.eq('category', filterCategory)
        if (filterMarketplace) query = query.eq('marketplace', filterMarketplace)
        if (filterStatus) query = query.eq('status', filterStatus)

        const { data } = await query
        if (!data || data.length === 0) {
          keepGoing = false
        } else {
          allRows = [...allRows, ...data]
          if (data.length < CHUNK) keepGoing = false
          else from += CHUNK
        }
      }

      const headers = ['Title', 'Order Number', 'Complaint Date', 'Category', 'Marketplace', 'Status', 'AI Suggestion', 'Created At']
      const csvRows = [
        headers.join(','),
        ...allRows.map(row => [
          `"${(row.title || '').replace(/"/g, '""')}"`,
          `"${row.order_number || ''}"`,
          `"${row.complaint_date || ''}"`,
          `"${row.category || ''}"`,
          `"${row.marketplace || ''}"`,
          `"${row.status || ''}"`,
          `"${(row.ai_suggestion || '').replace(/"/g, '""')}"`,
          `"${row.created_at || ''}"`,
        ].join(','))
      ]

      const csvContent = csvRows.join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `incidents-export-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
      alert('Export failed. Please try again.')
    }
    setIsExporting(false)
  }

  const colorOptions = Object.keys(colorMap).map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))

  const getPaginationRange = () => {
    const delta = 2
    const range: (number | '...')[] = []
    const left = Math.max(2, currentPage - delta)
    const right = Math.min(totalPages - 1, currentPage + delta)

    range.push(1)
    if (left > 2) range.push('...')
    for (let i = left; i <= right; i++) range.push(i)
    if (right < totalPages - 1) range.push('...')
    if (totalPages > 1) range.push(totalPages)
    return range
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30">
      <div className="max-w-7xl mx-auto p-6 md:p-10">

        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">Incidents</h1>
            <p className="text-slate-500 mt-1 text-sm">Track and manage customer service complaints in real-time</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleExport} disabled={isExporting}
              className="flex items-center gap-2 text-sm bg-white/70 backdrop-blur-sm border border-slate-200/70 px-4 py-2 rounded-full shadow-sm text-slate-600 hover:text-slate-900 hover:bg-white transition disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Export CSV
                </>
              )}
            </button>
            <button
              onClick={() => setShowManageLists(true)}
              className="flex items-center gap-2 text-sm bg-white/70 backdrop-blur-sm border border-slate-200/70 px-4 py-2 rounded-full shadow-sm text-slate-600 hover:text-slate-900 hover:bg-white transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              Manage Lists
            </button>
            <div className="flex items-center gap-2 text-sm bg-white/70 backdrop-blur-sm border border-slate-200/70 px-4 py-2 rounded-full shadow-sm">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-slate-600 font-medium">{userEmail}</span>
            </div>
          </div>
        </header>

        {/* AI Report Button */}
        <button
          onClick={async (e) => {
            const btn = e.currentTarget;
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Sending...';
            await fetch('/api/cron/report');
            btn.innerHTML = '✅ Sent!';
            setTimeout(() => btn.innerHTML = originalText, 3000);
          }}
          className="flex items-center gap-2 text-sm bg-violet-50 border border-violet-200 px-4 py-2 rounded-full shadow-sm text-violet-700 hover:bg-violet-100 transition font-medium"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
          Send AI Report
        </button>
      

        {/* COMBINED FILTERS: DATE, CATEGORY, MARKETPLACE, STATUS */}
        <div className="bg-white/70 backdrop-blur-sm border border-slate-200/60 rounded-2xl px-6 py-4 mb-6 shadow-sm">
          <div className="flex flex-col xl:flex-row xl:items-center gap-4">
            
            <div className="flex items-center gap-2 flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
              </svg>
              <span className="text-sm font-semibold text-slate-600 whitespace-nowrap">Filter</span>
            </div>
            
            <div className="hidden xl:block w-px h-6 bg-slate-200 flex-shrink-0" />
            
            <div className="flex flex-wrap items-center gap-3">
              {/* DATES */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-blue-200 transition">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">From</span>
                <input type="date" value={filterFrom}
                  onChange={(e) => applyFilter(e.target.value, filterTo, filterCategory, filterMarketplace, filterStatus)}
                  className="bg-transparent text-slate-800 text-sm focus:outline-none cursor-pointer" />
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-blue-200 transition">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">To</span>
                <input type="date" value={filterTo}
                  onChange={(e) => applyFilter(filterFrom, e.target.value, filterCategory, filterMarketplace, filterStatus)}
                  className="bg-transparent text-slate-800 text-sm focus:outline-none cursor-pointer" />
              </div>

              {/* DIVIDER ON TABLET/MOBILE */}
              <div className="hidden md:block xl:hidden w-px h-6 bg-slate-200 flex-shrink-0 mx-1" />

              {/* CATEGORY, MARKETPLACE, STATUS */}
              <select 
                value={filterStatus} 
                onChange={(e) => applyFilter(filterFrom, filterTo, filterCategory, filterMarketplace, e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200 transition cursor-pointer font-medium"
              >
                <option value="">All Statuses</option>
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>

              <select 
                value={filterCategory} 
                onChange={(e) => applyFilter(filterFrom, filterTo, e.target.value, filterMarketplace, filterStatus)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200 transition cursor-pointer font-medium"
              >
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>

              <select 
                value={filterMarketplace} 
                onChange={(e) => applyFilter(filterFrom, filterTo, filterCategory, e.target.value, filterStatus)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200 transition cursor-pointer font-medium"
              >
                <option value="">All Marketplaces</option>
                {marketplaces.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>

              {/* CLEAR BUTTON */}
              {(filterFrom || filterTo || filterCategory || filterMarketplace || filterStatus) && (
                <div className="flex items-center gap-2 ml-1">
                  <button
                    onClick={() => applyFilter('', '', '', '', '')}
                    className="flex items-center gap-1.5 text-xs font-medium text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-2 rounded-xl transition-all whitespace-nowrap"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                    Clear Filter
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* STATS CARDS - instantly responds to ALL filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {[
            { label: 'Total', value: totalCount, grad: 'from-slate-50 to-white', color: 'text-slate-700' },
            { label: 'Not Started', value: notStartedCount, grad: 'from-rose-50 to-white', color: 'text-rose-600' },
            { label: 'In Progress', value: inProgressCount, grad: 'from-amber-50 to-white', color: 'text-amber-600' },
            { label: 'Completed', value: completedCount, grad: 'from-emerald-50 to-white', color: 'text-emerald-600' },
          ].map(s => (
            <div key={s.label} className={`bg-gradient-to-br ${s.grad} p-5 rounded-2xl border border-white shadow-sm transition-all`}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{s.label}</p>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
            </div>
          ))}
        </div>

        {/* LOG INCIDENT BUTTON / FORM */}
        <div className="mb-8">
          {!showForm ? (
            <button onClick={() => setShowForm(true)}
              className="group bg-white hover:bg-blue-50/50 border border-dashed border-slate-300 hover:border-blue-300 text-slate-500 hover:text-blue-700 px-6 py-4 rounded-2xl w-full flex items-center justify-center gap-2 transition-all font-medium shadow-sm">
              <span className="text-xl group-hover:rotate-90 transition-transform duration-200">+</span>
              Log New Incident
            </button>
          ) : (
            <div className="bg-white/80 backdrop-blur-sm p-7 rounded-2xl shadow-sm border border-slate-200/60">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-slate-900">New Incident</h2>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700 text-2xl leading-none transition">×</button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Issue Description</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-slate-50/70 border border-slate-200 px-4 py-3 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition placeholder:text-slate-400"
                    placeholder="e.g., Customer received broken mug" required />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Order #</label>
                    <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)}
                      className="w-full bg-slate-50/70 border border-slate-200 px-4 py-3 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition placeholder:text-slate-400"
                      placeholder="10452" required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Complaint Date</label>
                    <input type="date" value={complaintDate} onChange={(e) => setComplaintDate(e.target.value)}
                      className="w-full bg-slate-50/70 border border-slate-200 px-4 py-3 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition" required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Category</label>
                    {isAddingCat ? (
                      <InlineAdd placeholder="e.g., Wrong Address" onCancel={() => setIsAddingCat(false)}
                        onAdd={handleAddCategory} extraField={{ label: 'Color', options: colorOptions }} />
                    ) : (
                      <div className="flex gap-1.5">
                        <select value={category} onChange={(e) => setCategory(e.target.value)}
                          className="w-full bg-slate-50/70 border border-slate-200 px-4 py-3 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200 transition cursor-pointer">
                          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                        <button type="button" onClick={() => setIsAddingCat(true)}
                          className="bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-600 px-3 rounded-xl transition font-bold text-lg" title="Add new category">+</button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Marketplace</label>
                    {isAddingMp ? (
                      <InlineAdd placeholder="e.g., TikTok Shop" onCancel={() => setIsAddingMp(false)} onAdd={handleAddMarketplace} />
                    ) : (
                      <div className="flex gap-1.5">
                        <select value={marketplace} onChange={(e) => setMarketplace(e.target.value)}
                          className="w-full bg-slate-50/70 border border-slate-200 px-4 py-3 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200 transition cursor-pointer">
                          {marketplaces.map(mp => <option key={mp.id} value={mp.name}>{mp.name}</option>)}
                        </select>
                        <button type="button" onClick={() => setIsAddingMp(true)}
                          className="bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-600 px-3 rounded-xl transition font-bold text-lg" title="Add new marketplace">+</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)}
                    className="px-6 py-2.5 text-slate-500 hover:text-slate-800 font-medium transition rounded-xl">Cancel</button>
                  <button type="submit" disabled={isSubmitting}
                    className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white px-7 py-2.5 rounded-xl font-medium shadow-sm transition-all flex items-center gap-2">
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                        Generating AI advice...
                      </>
                    ) : 'Save Incident'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* INCIDENTS TABLE */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Incident</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order #</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Marketplace</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">AI Suggestion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {incidents.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="text-4xl mb-2">📭</div>
                      <p className="text-sm text-slate-500">No incidents found</p>
                      <p className="text-xs mt-1 text-slate-400">Try adjusting your filters or log a new incident</p>
                    </td>
                  </tr>
                )}
                {incidents.map(inc => {
                  const sStyle = statusStyles[inc.status] || statusStyles['Not Started']
                  return (
                    <tr key={inc.id}
                      onClick={() => window.location.href = `/incidents/${inc.id}`}
                      className="hover:bg-blue-50/30 transition-colors cursor-pointer">
                      <td className="px-6 py-4 w-[220px]">
                        <p className="font-medium text-slate-800 text-sm leading-relaxed">{inc.title}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg">
                          #{inc.order_number || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">
                        {inc.complaint_date ? new Date(inc.complaint_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset ${getCategoryStyle(inc.category)}`}>
                          {inc.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-medium whitespace-nowrap">{inc.marketplace}</td>
                      <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${sStyle.select}`}>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sStyle.dot}`} />
                            {inc.status}
                          </div>
                          <select 
                            value={inc.status} 
                            onChange={(e) => {
                              // Prevent click from bubbling to the row
                              e.stopPropagation();
                              updateStatus(inc.id, e.target.value);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute inset-0 opacity-0 w-full cursor-pointer text-slate-900"
                          >
                            <option value="Not Started">Not Started</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-6 py-4 w-[280px]" onClick={(e) => e.stopPropagation()}>
                        {inc.ai_suggestion ? (
                          <div className="flex items-start gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
                            </svg>
                            <p className="text-xs text-slate-500 leading-relaxed">{inc.ai_suggestion}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300 italic">No suggestion</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/40">
              <p className="text-xs text-slate-500">
                Page <span className="font-semibold text-slate-700">{currentPage}</span> of{' '}
                <span className="font-semibold text-slate-700">{totalPages}</span>
                {' · '}
                <span className="font-semibold text-slate-700">{totalCount.toLocaleString()}</span> match filters
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  ←
                </button>
                {getPaginationRange().map((page, idx) =>
                  page === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-slate-400 text-sm">…</span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page as number)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition ${
                        currentPage === page
                          ? 'bg-blue-500 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200'
                      }`}
                    >
                      {page}
                    </button>
                  )
                )}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* MANAGE LISTS MODAL */}
        {showManageLists && (
          <ManageListsModal onClose={() => setShowManageLists(false)} />
        )}

      </div>
    </div>
  )
}