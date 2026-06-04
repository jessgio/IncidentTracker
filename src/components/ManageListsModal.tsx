'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { categoryColorMap } from '../lib/incident-status'

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
    <div className="fixed inset-0 bg-zinc-900/50 z-[60] flex items-center justify-center p-4">
      <div className="app-card p-6 max-w-sm w-full">
        <h3 className="text-lg font-semibold text-zinc-900 mb-2">Delete &ldquo;{itemName}&rdquo;?</h3>
        <p className="text-sm text-zinc-600 leading-relaxed mb-6">
          This removes it from dropdown lists. Existing incidents are not changed.
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="app-btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition"
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
    const { data: catData } = await supabase.from('categories').select('id, name, color').order('name', { ascending: true })
    if (catData) setCategories(catData)

    const { data: mpData } = await supabase.from('marketplaces').select('id, name').order('name', { ascending: true })
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
      <div className="fixed inset-0 bg-zinc-900/50 z-40" onClick={onClose} aria-hidden />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="app-card w-full max-w-md pointer-events-auto overflow-hidden"
          role="dialog"
          aria-labelledby="manage-lists-title"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 bg-zinc-50">
            <h2 id="manage-lists-title" className="text-lg font-semibold text-zinc-900">
              Manage lists
            </h2>
            <button type="button" onClick={onClose} className="app-btn-ghost w-8 h-8 p-0" aria-label="Close">
              ×
            </button>
          </div>

          <div className="flex gap-1 p-3 mx-4 mt-4 bg-zinc-100 rounded-lg">
            {(['categories', 'marketplaces'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => { setActiveTab(tab); setDeleteError('') }}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-semibold transition capitalize ${
                  activeTab === tab
                    ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {tab}
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded ${
                  activeTab === tab ? 'bg-blue-100 text-blue-800' : 'bg-zinc-200 text-zinc-700'
                }`}>
                  {tab === 'categories' ? categories.length : marketplaces.length}
                </span>
              </button>
            ))}
          </div>

          <div className="px-4 py-3 max-h-[360px] overflow-y-auto">
            {deleteError && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 text-red-800 text-xs font-medium rounded-lg">
                {deleteError}
              </div>
            )}

            {items.length === 0 && (
              <div className="text-center py-10 rounded-lg border border-dashed border-zinc-200 bg-zinc-50">
                <p className="text-sm font-medium text-zinc-600">No {activeTab} yet</p>
              </div>
            )}

            <ul className="space-y-1">
              {items.map(item => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg hover:bg-zinc-50 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {activeTab === 'categories' && item.color && (
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ring-inset truncate ${categoryColorMap[item.color || 'slate'] || categoryColorMap.slate}`}>
                        {item.name}
                      </span>
                    )}
                    {activeTab === 'marketplaces' && (
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 shrink-0 rounded-md bg-zinc-200 flex items-center justify-center text-xs font-semibold text-zinc-700 border border-zinc-300">
                          {item.name[0].toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-zinc-900 truncate">{item.name}</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => { setConfirmDelete(item); setDeleteError('') }}
                    className="shrink-0 text-xs font-semibold text-red-700 hover:text-white bg-red-50 hover:bg-red-600 px-2.5 py-1.5 rounded-md transition border border-red-200 hover:border-red-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="px-4 py-4 border-t border-zinc-200 bg-zinc-50">
            <p className="text-xs text-zinc-600 text-center">
              Add new {activeTab} from the &ldquo;Log new incident&rdquo; form.
            </p>
          </div>
        </div>
      </div>

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
