'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { categoryColorMap } from '../lib/incident-status'

// Types
type Item = {
  id: string
  name: string
  color?: string
}

function ConfirmDeleteModal({
  itemName,
  onConfirm,
  onCancel,
}: {
  itemName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border-2 border-slate-200 p-7 max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">🗑️</div>
          <h3 className="text-xl font-black text-slate-900 mb-2">Delete "{itemName}"?</h3>
          <p className="text-sm font-medium text-slate-600 leading-relaxed">
            This will permanently remove it from the dropdown list. Existing incidents will not be affected.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-5 py-3 rounded-xl border-2 border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm transition shadow-sm border border-rose-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export function ManageListsModal({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'categories' | 'marketplaces'>('categories')
  const [categories, setCategories] = useState<Item[]>([])
  const [marketplaces, setMarketplaces] = useState<Item[]>([])
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null)
  const [deleteError, setDeleteError] = useState('')

  const supabase = createClient()

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    const { data: catData } = await supabase.from('categories').select('*').order('name', { ascending: true })
    if (catData) setCategories(catData)

    const { data: mpData } = await supabase.from('marketplaces').select('*').order('name', { ascending: true })
    if (mpData) setMarketplaces(mpData)
  }

  const handleDelete = async (item: Item, table: 'categories' | 'marketplaces') => {
    setDeleteError('')
    const { error } = await supabase.from(table).delete().eq('id', item.id)

    if (error) {
      setDeleteError(`Could not delete "${item.name}".`)
    } else {
      fetchAll()
    }
    setConfirmDelete(null)
  }

  const items = activeTab === 'categories' ? categories : marketplaces

  return (
    <>
      {/* BACKDROP */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />

      {/* MODAL */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-3xl shadow-2xl border-2 border-slate-200 w-full max-w-md pointer-events-auto overflow-hidden">

          {/* HEADER */}
          <div className="flex items-center justify-between px-7 py-5 bg-slate-50 border-b-2 border-slate-200">
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-widest">Manage Lists</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition text-2xl font-bold leading-none">
              ×
            </button>
          </div>

          {/* TABS */}
          <div className="flex gap-2 p-3 mx-6 mt-5 bg-slate-100 rounded-xl border border-slate-200">
            {(['categories', 'marketplaces'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setDeleteError('') }}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition capitalize ${
                  activeTab === tab
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                }`}
              >
                {tab}
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-md ${
                  activeTab === tab ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
                }`}>
                  {tab === 'categories' ? categories.length : marketplaces.length}
                </span>
              </button>
            ))}
          </div>

          {/* LIST */}
          <div className="px-6 py-4 mt-2 max-h-[360px] overflow-y-auto">
            {deleteError && (
              <div className="mb-4 px-4 py-3 bg-rose-50 border-2 border-rose-200 text-rose-700 font-bold text-xs rounded-xl">
                {deleteError}
              </div>
            )}

            {items.length === 0 && (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-sm font-bold text-slate-500">No {activeTab} yet</p>
              </div>
            )}

            <ul className="space-y-2">
              {items.map(item => (
                <li key={item.id} className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-slate-50 border-2 border-transparent hover:border-slate-200 transition group">
                  <div className="flex items-center gap-3">
                    {/* Color dot for categories */}
                    {activeTab === 'categories' && item.color && (
                      <span className={`px-3 py-1.5 rounded-full text-xs font-bold ring-1 ring-inset ${categoryColorMap[item.color || 'slate'] || categoryColorMap.slate}`}>
                        {item.name}
                      </span>
                    )}

                    {/* Plain name for marketplaces */}
                    {activeTab === 'marketplaces' && (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center text-xs font-black text-slate-600 border border-slate-300">
                          {item.name[0].toUpperCase()}
                        </div>
                        <span className="text-sm font-bold text-slate-900">{item.name}</span>
                      </div>
                    )}
                  </div>

                  {/* DELETE BUTTON */}
                  <button
                    onClick={() => { setConfirmDelete(item); setDeleteError('') }}
                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 px-3 py-2 rounded-lg transition-all border border-rose-200 hover:border-rose-600"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* FOOTER */}
          <div className="px-6 py-5 bg-slate-50 border-t-2 border-slate-200 mt-2">
            <p className="text-xs font-bold text-slate-500 text-center flex items-center justify-center gap-2">
              💡 You can add new {activeTab} directly from the "Log New Incident" form.
            </p>
          </div>
        </div>
      </div>

      {/* CONFIRM DELETE SUB-MODAL */}
      {confirmDelete && (
        <ConfirmDeleteModal
          itemName={confirmDelete.name}
          onConfirm={() => handleDelete(confirmDelete, activeTab)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  )
}