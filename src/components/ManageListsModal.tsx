'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'


type Item = {
  id: string
  name: string
  color?: string
}

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
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 max-w-sm w-full">
        <div className="text-center mb-5">
          <div className="text-4xl mb-3">🗑️</div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">Delete "{itemName}"?</h3>
          <p className="text-sm text-slate-500">
            This will remove it from the list. Existing incidents that used this value will not be affected.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-medium text-sm transition shadow-sm shadow-rose-200"
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
    const { data: catData } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true })
    if (catData) setCategories(catData)

    const { data: mpData } = await supabase
      .from('marketplaces')
      .select('*')
      .order('name', { ascending: true })
    if (mpData) setMarketplaces(mpData)
  }

  const handleDelete = async (item: Item, table: 'categories' | 'marketplaces') => {
    setDeleteError('')
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', item.id)

    if (error) {
      setDeleteError(`Could not delete "${item.name}". It may be in use.`)
    } else {
      fetchAll()
    }
    setConfirmDelete(null)
  }

  const items = activeTab === 'categories' ? categories : marketplaces

  return (
    <>
      {/* BACKDROP */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* MODAL */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-200/60 w-full max-w-md pointer-events-auto">

          {/* HEADER */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Manage Lists</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Add or remove categories and marketplaces
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition text-xl leading-none"
            >
              ×
            </button>
          </div>

          {/* TABS */}
          <div className="flex gap-1 p-2 mx-6 mt-4 bg-slate-100 rounded-xl">
            {(['categories', 'marketplaces'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setDeleteError('') }}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition capitalize ${
                  activeTab === tab
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab}
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-500'
                }`}>
                  {tab === 'categories' ? categories.length : marketplaces.length}
                </span>
              </button>
            ))}
          </div>

          {/* LIST */}
          <div className="px-6 py-4 max-h-[360px] overflow-y-auto">
            {deleteError && (
              <div className="mb-3 px-4 py-2.5 bg-rose-50 border border-rose-200 text-rose-600 text-xs rounded-xl">
                {deleteError}
              </div>
            )}

            {items.length === 0 && (
              <div className="text-center py-10">
                <div className="text-3xl mb-2">📭</div>
                <p className="text-sm text-slate-400">No {activeTab} yet</p>
              </div>
            )}

            <ul className="space-y-2">
              {items.map(item => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition group"
                >
                  <div className="flex items-center gap-3">
                    {/* Color dot for categories */}
                    {activeTab === 'categories' && item.color && (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset ${colorMap[item.color] || colorMap['slate']}`}>
                        {item.name}
                      </span>
                    )}

                    {/* Plain name for marketplaces */}
                    {activeTab === 'marketplaces' && (
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                          {item.name[0].toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-slate-700">{item.name}</span>
                      </div>
                    )}
                  </div>

                  {/* DELETE BUTTON */}
                  <button
                    onClick={() => { setConfirmDelete(item); setDeleteError('') }}
                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg transition-all"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* FOOTER */}
          <div className="px-6 py-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 text-center">
              Deleting a {activeTab === 'categories' ? 'category' : 'marketplace'} will not affect existing incidents
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