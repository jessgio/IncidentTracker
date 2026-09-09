'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../utils/supabase/client'
import { categoryColorMap } from '../lib/incident-status'
import { ACTION_OPTIONS_TABLE } from '../lib/action-options'

type ListTab = 'categories' | 'marketplaces' | 'actions'

type Item = {
  id: string
  name: string
  color?: string
}

const TAB_LABELS: Record<ListTab, string> = {
  categories: 'Categories',
  marketplaces: 'Marketplaces',
  actions: 'Actions',
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
  const [activeTab, setActiveTab] = useState<ListTab>('categories')
  const [categories, setCategories] = useState<Item[]>([])
  const [marketplaces, setMarketplaces] = useState<Item[]>([])
  const [actions, setActions] = useState<Item[]>([])
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [newAction, setNewAction] = useState('')
  const [addingAction, setAddingAction] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    const { data: catData } = await supabase.from('categories').select('id, name, color').order('name', { ascending: true })
    if (catData) setCategories(catData)

    const { data: mpData } = await supabase.from('marketplaces').select('id, name').order('name', { ascending: true })
    if (mpData) setMarketplaces(mpData)

    const { data: actionData, error: actionError } = await supabase
      .from(ACTION_OPTIONS_TABLE)
      .select('id, name')
      .order('name', { ascending: true })
    if (!actionError && actionData) setActions(actionData)
  }

  const handleDelete = async (item: Item, table: ListTab) => {
    setDeleteError('')
    const dbTable = table === 'actions' ? ACTION_OPTIONS_TABLE : table
    const { error } = await supabase.from(dbTable).delete().eq('id', item.id)

    if (error) {
      setDeleteError(`Could not delete "${item.name}".`)
    } else {
      fetchAll()
    }
    setConfirmDelete(null)
  }

  const handleAddAction = async () => {
    const name = newAction.trim()
    if (!name || addingAction) return
    setAddingAction(true)
    setDeleteError('')
    const { error } = await supabase.from(ACTION_OPTIONS_TABLE).insert([{ name }])
    setAddingAction(false)
    if (error) {
      setDeleteError(
        error.code === '42P01'
          ? 'Action list is not set up yet. Run the action_options SQL in Supabase first.'
          : `Could not add "${name}". It may already exist.`
      )
      return
    }
    setNewAction('')
    fetchAll()
  }

  const handleRenameAction = async (item: Item) => {
    const name = editingName.trim()
    if (!name || savingEdit) return
    if (name === item.name) {
      setEditingId(null)
      return
    }
    setSavingEdit(true)
    setDeleteError('')
    const { error } = await supabase.from(ACTION_OPTIONS_TABLE).update({ name }).eq('id', item.id)
    if (error) {
      setSavingEdit(false)
      setDeleteError(`Could not rename to "${name}". It may already exist.`)
      return
    }
    await supabase.from('incidents').update({ action_taken: name }).eq('action_taken', item.name)
    setSavingEdit(false)
    setEditingId(null)
    fetchAll()
  }

  const items = activeTab === 'categories' ? categories : activeTab === 'marketplaces' ? marketplaces : actions

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
            {(['categories', 'marketplaces', 'actions'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => { setActiveTab(tab); setDeleteError(''); setEditingId(null) }}
                className={`flex-1 py-2 px-2 rounded-md text-sm font-semibold transition ${
                  activeTab === tab
                    ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {TAB_LABELS[tab]}
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded ${
                  activeTab === tab ? 'bg-blue-100 text-blue-800' : 'bg-zinc-200 text-zinc-700'
                }`}>
                  {tab === 'categories' ? categories.length : tab === 'marketplaces' ? marketplaces.length : actions.length}
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
                <p className="text-sm font-medium text-zinc-600">No {TAB_LABELS[activeTab].toLowerCase()} yet</p>
              </div>
            )}

            <ul className="space-y-1">
              {items.map(item => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg hover:bg-zinc-50 group"
                >
                  {activeTab === 'actions' && editingId === item.id ? (
                    <form
                      className="flex items-center gap-2 w-full"
                      onSubmit={(e) => { e.preventDefault(); void handleRenameAction(item) }}
                    >
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="app-input py-1.5 text-sm flex-1 min-w-0"
                      />
                      <button type="submit" disabled={savingEdit} className="app-btn-primary text-xs px-2.5 py-1.5">
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="app-btn-secondary text-xs px-2.5 py-1.5">
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 min-w-0">
                        {activeTab === 'categories' && item.color && (
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ring-inset truncate ${categoryColorMap[item.color || 'slate'] || categoryColorMap.slate}`}>
                            {item.name}
                          </span>
                        )}
                        {activeTab !== 'categories' && (
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 shrink-0 rounded-md bg-zinc-200 flex items-center justify-center text-xs font-semibold text-zinc-700 border border-zinc-300">
                              {item.name[0].toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-zinc-900 truncate">{item.name}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                        {activeTab === 'actions' && (
                          <button
                            type="button"
                            onClick={() => { setEditingId(item.id); setEditingName(item.name); setDeleteError('') }}
                            className="text-xs font-semibold text-zinc-700 hover:text-white bg-zinc-100 hover:bg-zinc-800 px-2.5 py-1.5 rounded-md transition border border-zinc-200 hover:border-zinc-800"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { setConfirmDelete(item); setDeleteError('') }}
                          className="text-xs font-semibold text-red-700 hover:text-white bg-red-50 hover:bg-red-600 px-2.5 py-1.5 rounded-md transition border border-red-200 hover:border-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="px-4 py-4 border-t border-zinc-200 bg-zinc-50">
            {activeTab === 'actions' ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => { e.preventDefault(); void handleAddAction() }}
              >
                <input
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  placeholder="Add a new action"
                  className="app-input py-2 text-sm flex-1 min-w-0"
                />
                <button type="submit" disabled={addingAction || !newAction.trim()} className="app-btn-primary px-3 text-sm">
                  Add
                </button>
              </form>
            ) : (
              <p className="text-xs text-zinc-600 text-center">
                Add new {TAB_LABELS[activeTab].toLowerCase()} from the &ldquo;Log new incident&rdquo; form.
              </p>
            )}
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
