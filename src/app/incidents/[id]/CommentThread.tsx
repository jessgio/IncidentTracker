'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../utils/supabase/client'
import {
  incidentExtraFields, emptyExtraFormState, extraFormToDbPayload, incidentToExtraForm, formatExtraValue, formatDateOnly,
  type ExtraFormState, type IncidentExtraDbFields, type ExtraFieldKey
} from '../../../lib/incident-extra-fields'
import {
  STATUS_VALUES, WAITING_ON_WAREHOUSE, statusMeta, statusChangePatch, categoryRingStyle,
  canDeleteIncidents,
  type UserRole,
} from '../../../lib/incident-status'
import { deleteIncident } from '../../../lib/delete-incident'
import { storagePathFromPublicUrl, type AttachmentItem } from '../../../lib/attachment-utils'
import { AttachmentGallery } from '../../../components/AttachmentGallery'
import { WarehouseNotifyModal } from '../../../components/WarehouseNotifyModal'
import { CsNotifyModal } from '../../../components/CsNotifyModal'
import { CommentBody } from '../../../components/CommentBody'
import { MentionTextarea } from '../../../components/MentionTextarea'
import type { CsNotifyTemplateId } from '../../../lib/cs-notify-templates'

type Attachment = AttachmentItem
type Comment = { id: string; comment_text: string; created_at: string; user_id: string; profiles: { full_name: string; email: string } }
type Incident = {
  id: string; title: string; status: string; category: string; marketplace: string;
  order_number: string; complaint_date: string; created_at: string; assigned_to: string | null;
  resolved_at?: string | null; warehouse_requested_at?: string | null;
  profiles: { full_name: string; email: string } | null
} & IncidentExtraDbFields

type Profile = { id: string; full_name: string; email: string; role?: string }

const WAREHOUSE_STATUS_OPTIONS = incidentExtraFields.find(f => f.key === 'warehouse_status')?.options ?? []

export default function CommentThread({
  incidentId, currentUserId, userRole,
}: {
  incidentId: string
  currentUserId: string
  userRole: UserRole
}) {
  const [incident, setIncident] = useState<Incident | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [agents, setAgents] = useState<Profile[]>([])
  const [categories, setCategories] = useState<{ name: string; color: string }[]>([])
  const [marketplaces, setMarketplaces] = useState<{ id: string; name: string }[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  
  const [newComment, setNewComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isDeletingCase, setIsDeletingCase] = useState(false)
  const [showWarehouseNotify, setShowWarehouseNotify] = useState(false)
  const [showCsNotify, setShowCsNotify] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editOrderNumber, setEditOrderNumber] = useState('')
  const [editComplaintDate, setEditComplaintDate] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editMarketplace, setEditMarketplace] = useState('')
  const [editExtraForm, setEditExtraForm] = useState<ExtraFormState>({ ...emptyExtraFormState })

  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [comments.length])

  const fetchAll = useCallback(async () => {
    const [incRes, commentRes, agentRes, catRes, mpRes, attRes] = await Promise.all([
      supabase.from('incidents').select('*, profiles(full_name, email)').eq('id', incidentId).single(),
      supabase.from('comments').select('*, profiles(full_name, email)').eq('incident_id', incidentId).order('created_at', { ascending: true }),
      supabase.from('profiles').select('id, full_name, email, role'),
      supabase.from('categories').select('name, color').order('name'),
      supabase.from('marketplaces').select('id, name').order('name'),
      supabase.from('attachments').select('id, file_name, file_type, file_url, created_at').eq('incident_id', incidentId).order('created_at', { ascending: true }),
    ])
    if (incRes.data) setIncident(incRes.data)
    if (commentRes.data) setComments(commentRes.data as Comment[])
    if (agentRes.data) setAgents(agentRes.data)
    if (catRes.data) setCategories(catRes.data)
    if (mpRes.data) setMarketplaces(mpRes.data)
    if (attRes.data) setAttachments(attRes.data)
  }, [supabase, incidentId])

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(() => { fetchAll() }, 400)
  }, [fetchAll])

  useEffect(() => {
    fetchAll()
    const channel = supabase.channel(`comments_${incidentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `incident_id=eq.${incidentId}` }, scheduleRefetch)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'incidents', filter: `id=eq.${incidentId}` }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments', filter: `incident_id=eq.${incidentId}` }, scheduleRefetch)
      .subscribe()
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current)
      supabase.removeChannel(channel)
    }
  }, [incidentId, supabase, fetchAll, scheduleRefetch])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files || files.length === 0) return; setIsUploading(true)
    for (const file of Array.from(files)) {
      const fileExt = file.name.split('.').pop()
      const fileName = `${incidentId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`
      const { data: uploadData, error: uploadError } = await supabase.storage.from('incident-attachments').upload(fileName, file)
      if (!uploadError && uploadData) {
        const { data: urlData } = supabase.storage.from('incident-attachments').getPublicUrl(uploadData.path)
        await supabase.from('attachments').insert([{ incident_id: incidentId, user_id: currentUserId, file_name: file.name, file_type: file.type, file_url: urlData.publicUrl }])
      }
    }
    await fetchAll(); setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDeleteCase = async () => {
    if (!incident || !canDeleteIncidents(userRole)) return
    const confirmed = window.confirm(
      `Permanently delete this case?\n\nOrder #${incident.order_number}\n${incident.title}\n\nAll comments and attachments will be removed. This cannot be undone.`
    )
    if (!confirmed) return
    setIsDeletingCase(true)
    const { ok, error } = await deleteIncident(supabase, incidentId)
    setIsDeletingCase(false)
    if (!ok) {
      window.alert(error ?? 'Could not delete this case. Please try again.')
      return
    }
    router.push('/')
    router.refresh()
  }

  const handleDeleteAttachment = async (attachment: AttachmentItem) => {
    const path = storagePathFromPublicUrl(attachment.file_url)
    if (path) {
      await supabase.storage.from('incident-attachments').remove([path])
    }
    const { error } = await supabase.from('attachments').delete().eq('id', attachment.id)
    if (error) {
      window.alert('Could not delete this file. Please try again.')
      return
    }
    setAttachments(prev => prev.filter(a => a.id !== attachment.id))
  }

  const handleSubmitComment = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const text = newComment.trim()
    if (!text) return
    setIsSubmitting(true)
    const res = await fetch(`/api/incidents/${incidentId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentText: text }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      window.alert((data as { error?: string }).error ?? 'Could not post comment.')
      setIsSubmitting(false)
      return
    }
    if ((data as { emailFailures?: string[] }).emailFailures?.length) {
      console.warn('Some mention emails failed:', (data as { emailFailures: string[] }).emailFailures)
    }
    setNewComment('')
    await fetchAll()
    setIsSubmitting(false)
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!incident) return
    const patch = statusChangePatch(newStatus, {
      resolved_at: incident.resolved_at,
      warehouse_status: incident.warehouse_status,
    })
    setIncident({ ...incident, ...patch } as Incident)
    await supabase.from('incidents').update(patch).eq('id', incidentId)
  }

  const handleWarehouseStatusChange = async (newWs: string) => {
    if (!incident) return
    const patch: Record<string, string | null> = {
      warehouse_status: newWs || null,
      updated_at: new Date().toISOString(),
    }
    if (newWs === 'Completed') {
      patch.warehouse_completed_at = new Date().toISOString()
    }
    if (newWs === 'Completed' && incident.status === WAITING_ON_WAREHOUSE) {
      Object.assign(patch, statusChangePatch('Investigating', {
        resolved_at: incident.resolved_at,
        warehouse_status: newWs,
      }))
    }
    setIncident({ ...incident, ...patch } as Incident)
    await supabase.from('incidents').update(patch).eq('id', incidentId)
    if (newWs === 'Completed') {
      await supabase.from('comments').insert([{
        incident_id: incidentId,
        user_id: currentUserId,
        comment_text: 'Warehouse marked fulfillment as Completed — case returned to CS for customer follow-up.',
      }])
    }
  }

  const requestWarehouse = () => handleStatusChange(WAITING_ON_WAREHOUSE)

  const warehouseMembers = agents.filter(a => a.role === 'warehouse')
  const csMembers = agents.filter(a => a.role === 'cs' || a.role === 'manager')
  const canNotifyWarehouse = userRole === 'cs' || userRole === 'manager'
  const canNotifyCs = userRole === 'warehouse'

  const sendWarehouseNotify = async (recipientIds: string[], message: string) => {
    const res = await fetch(`/api/incidents/${incidentId}/notify-warehouse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientIds, message }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (data as { error?: string }).error ?? 'Could not send email.' }
    }
    await fetchAll()
    return { ok: true }
  }

  const sendCsNotify = async (
    recipientIds: string[],
    message: string,
    templateId: CsNotifyTemplateId
  ) => {
    const res = await fetch(`/api/incidents/${incidentId}/notify-cs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientIds, message, templateId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (data as { error?: string }).error ?? 'Could not send email.' }
    }
    await fetchAll()
    return { ok: true }
  }

  const handleAssigneeChange = async (newAssigneeId: string) => {
    const aAgent = agents.find(a => a.id === newAssigneeId) || null
    if (incident) setIncident({ ...incident, assigned_to: newAssigneeId || null, profiles: aAgent ? { full_name: aAgent.full_name, email: aAgent.email } : null })
    await supabase.from('incidents').update({ assigned_to: newAssigneeId || null, updated_at: new Date().toISOString() }).eq('id', incidentId)
  }

  const startEditing = () => {
    if (!incident) return
    setEditTitle(incident.title); setEditOrderNumber(incident.order_number || ''); setEditComplaintDate(incident.complaint_date || ''); setEditCategory(incident.category || ''); setEditMarketplace(incident.marketplace || '');
    setEditExtraForm(incidentToExtraForm(incident))
    setIsEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!editTitle) return; setIsSubmitting(true)
    await supabase.from('incidents').update({ title: editTitle, order_number: editOrderNumber, complaint_date: editComplaintDate, category: editCategory, marketplace: editMarketplace, ...extraFormToDbPayload(editExtraForm), updated_at: new Date().toISOString() }).eq('id', incidentId)
    setIsSubmitting(false); setIsEditing(false); fetchAll()
  }

  const formatTime = (ts: string) => {
    const min = Math.floor((new Date().getTime() - new Date(ts).getTime()) / 60000)
    if (min < 1) return 'just now'; if (min < 60) return `${min}m ago`; if (min < 1440) return `${Math.floor(min / 60)}h ago`; if (min < 10080) return `${Math.floor(min / 1440)}d ago`
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (!incident) {
    return (
      <div className="app-page flex items-center justify-center">
        <p className="text-sm font-medium text-zinc-600">Loading incident…</p>
      </div>
    )
  }

  const sm = statusMeta(incident.status)
  const waitingOnWarehouse = incident.status === WAITING_ON_WAREHOUSE
  const canRequestWarehouse = userRole !== 'warehouse' && !waitingOnWarehouse && sm.isOpen
  const showDeleteCase = canDeleteIncidents(userRole)

  return (
    <div className="app-page">
      {showCsNotify && (
        <CsNotifyModal
          orderNumber={incident.order_number}
          warehouseStatus={incident.warehouse_status}
          bpbNumber={incident.bpb_number}
          customerAddress={incident.customer_address}
          courier={incident.courier}
          shippingLabel={incident.shipping_label}
          members={csMembers}
          assignedPicId={incident.assigned_to}
          onClose={() => setShowCsNotify(false)}
          onSend={async (recipientIds, message, templateId) => {
            const result = await sendCsNotify(recipientIds, message, templateId)
            if (result.ok) {
              window.alert(`Email sent to ${recipientIds.length} CS team member${recipientIds.length === 1 ? '' : 's'}.`)
            }
            return result
          }}
        />
      )}
      {showWarehouseNotify && (
        <WarehouseNotifyModal
          orderNumber={incident.order_number}
          members={warehouseMembers}
          onClose={() => setShowWarehouseNotify(false)}
          onSend={async (recipientIds, message) => {
            const result = await sendWarehouseNotify(recipientIds, message)
            if (result.ok) {
              window.alert(`Email sent to ${recipientIds.length} warehouse team member${recipientIds.length === 1 ? '' : 's'}.`)
            }
            return result
          }}
        />
      )}
      <div className="app-container max-w-5xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-600 hover:text-blue-700 transition mb-6">
          ← Back to dashboard
        </Link>

        <div className="app-card p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            
            <div className="flex-1 w-full">
              {!isEditing ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ring-1 ring-inset ${categoryRingStyle(categories.find(c => c.name === incident.category)?.color)}`}>{incident.category}</span>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ring-1 ring-inset ${sm.badge}`}>{incident.status}</span>
                      <span className="text-xs text-zinc-800 font-mono font-semibold bg-zinc-100 px-2 py-1 rounded-md border border-zinc-200">#{incident.order_number}</span>
                    </div>
                    <button type="button" onClick={startEditing} className="app-btn-secondary text-xs py-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" /></svg>
                      Edit Case
                    </button>
                  </div>
                  <h1 className="text-2xl font-semibold text-zinc-900 mb-2 leading-snug">{incident.title}</h1>
                  <p className="text-sm text-zinc-600 mt-2">
                    Logged {new Date(incident.created_at).toLocaleDateString('en-US', { dateStyle: 'long'})}
                    <span className="mx-2 text-zinc-300">·</span>
                    Complaint: <span className="text-zinc-900 font-semibold">{formatDateOnly(incident.complaint_date)}</span>
                  </p>
                  
                  <div className="mt-6 border-t border-zinc-100 pt-5">
                    <h3 className="text-sm font-semibold text-zinc-800 mb-4">Additional details</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-y-5 gap-x-5">
                      {incidentExtraFields.map(field => {
                        if (field.key === 'province') return null
                        if (field.key === 'customer_address') {
                          const addressVal = incident.customer_address
                          const provinceVal = incident.province
                          if (!addressVal && !provinceVal) return null
                          return (
                            <div key="address-block" className="col-span-2 md:col-span-3">
                              {addressVal ? (
                                <>
                                  <p className="app-label mb-1">Address</p>
                                  <p className="text-sm text-zinc-900 whitespace-pre-wrap leading-relaxed bg-zinc-50 border border-zinc-200 px-3 py-2 rounded-lg">
                                    {formatExtraValue(addressVal, 'textarea')}
                                  </p>
                                </>
                              ) : null}
                              {provinceVal ? (
                                <>
                                  <p className={`app-label mb-1 ${addressVal ? 'mt-3' : ''}`}>Province</p>
                                  <p className="text-sm text-zinc-900 bg-zinc-50 border border-zinc-200 px-3 py-2 rounded-lg">
                                    {provinceVal}
                                  </p>
                                </>
                              ) : null}
                            </div>
                          )
                        }
                        const val = incident[field.key as keyof IncidentExtraDbFields]
                        if (val === null || val === undefined || val === '') return null
                        return (
                          <div key={field.key} className={field.type === 'textarea' ? 'col-span-2 md:col-span-3' : ''}>
                            <p className="app-label mb-1">{field.label}</p>
                            <p className="text-sm text-zinc-900 whitespace-pre-wrap leading-relaxed bg-zinc-50 border border-zinc-200 px-3 py-2 rounded-lg">{formatExtraValue(val, field.type)}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-5">
                  <div>
                    <label className="app-label">Issue description</label>
                    <textarea value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="app-input resize-y" rows={2} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><label className="app-label">Order #</label><input value={editOrderNumber} onChange={(e) => setEditOrderNumber(e.target.value)} className="app-input" /></div>
                    <div><label className="app-label">Date</label><input type="date" value={editComplaintDate} onChange={(e) => setEditComplaintDate(e.target.value)} className="app-input" /></div>
                    <div><label className="app-label">Category</label><select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="app-select w-full"><option value="">Select</option>{categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select></div>
                    <div><label className="app-label">Marketplace</label><select value={editMarketplace} onChange={(e) => setEditMarketplace(e.target.value)} className="app-select w-full"><option value="">Select</option>{marketplaces.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}</select></div>
                  </div>
                  
                  <div className="border-t border-zinc-100 pt-4 mt-2">
                    <h3 className="text-sm font-semibold text-zinc-800 mb-3">Additional details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {incidentExtraFields.map(field => {
                        if (field.key === 'province') return null
                        if (field.key === 'customer_address') {
                          return (
                            <div key="address-block" className="md:col-span-2">
                              <label className="app-label">Address</label>
                              <textarea
                                value={editExtraForm.customer_address}
                                onChange={(e) => setEditExtraForm(p => ({ ...p, customer_address: e.target.value }))}
                                rows={3}
                                className="app-input resize-y"
                                placeholder="Customer address"
                              />
                              <label className="app-label mt-3">Province</label>
                              <input
                                value={editExtraForm.province}
                                onChange={(e) => setEditExtraForm(p => ({ ...p, province: e.target.value }))}
                                placeholder="e.g. Banten, DKI Jakarta"
                                className="app-input"
                              />
                            </div>
                          )
                        }
                        return (
                          <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                            <label className="app-label">{field.label}</label>
                            {field.type === 'textarea' ? (
                              <textarea value={editExtraForm[field.key as ExtraFieldKey]} onChange={(e) => setEditExtraForm(p=>({ ...p, [field.key]: e.target.value }))} rows={2} className="app-input resize-y" placeholder={(field as any).placeholder} />
                            ) : field.type === 'select' ? (
                              <select value={editExtraForm[field.key as ExtraFieldKey]} onChange={(e) => setEditExtraForm(p=>({ ...p, [field.key]: e.target.value }))} className="app-select w-full">
                                {(field as any).options?.map((o: string) => <option key={o} value={o}>{o || 'Select…'}</option>)}
                              </select>
                            ) : (
                              <input type={field.type === 'money' ? 'number' : field.type} step={field.type==='money'?'0.01':undefined} value={editExtraForm[field.key as ExtraFieldKey]} onChange={(e) => setEditExtraForm(p=>({ ...p, [field.key]: e.target.value }))} placeholder={(field as any).placeholder} className="app-input" />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4 border-t border-zinc-100">
                    <button type="button" onClick={() => setIsEditing(false)} className="app-btn-secondary">Cancel</button>
                    <button type="button" onClick={handleSaveEdit} disabled={isSubmitting} className="app-btn-primary">
                      {isSubmitting ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!isEditing && (
              <div className="flex flex-col gap-4 min-w-[240px] border-t md:border-t-0 md:border-l border-zinc-100 pt-5 md:pt-0 md:pl-6">
                <div>
                  <label className="app-label">Status</label>
                  <select
                    value={incident.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className={`w-full text-sm font-bold px-4 py-2.5 rounded-xl border-2 focus:outline-none focus:ring-2 focus:ring-blue-300 ${sm.select}`}
                  >
                    {STATUS_VALUES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {canRequestWarehouse && (
                  <button
                    type="button"
                    onClick={requestWarehouse}
                    className="w-full text-xs font-semibold bg-orange-100 hover:bg-orange-200 text-orange-900 border border-orange-300 px-4 py-2.5 rounded-lg transition"
                  >
                    Hand off to Warehouse
                  </button>
                )}
                {canNotifyWarehouse && (
                  <button
                    type="button"
                    onClick={() => setShowWarehouseNotify(true)}
                    className="w-full text-xs font-semibold bg-white hover:bg-orange-50 text-orange-900 border border-orange-300 px-4 py-2.5 rounded-lg transition"
                  >
                    Email warehouse team
                  </button>
                )}
                {userRole !== 'warehouse' && (
                  <div>
                    <label className="app-label">Assigned to</label>
                    <select value={incident.assigned_to || ''} onChange={(e) => handleAssigneeChange(e.target.value)} className="app-select w-full"><option value="">Unassigned</option>{agents.map(a => <option key={a.id} value={a.id}>{a.full_name || a.email}</option>)}</select>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {!isEditing && (
            <div className="mt-5 pt-4 border-t border-zinc-100 flex items-center gap-2 flex-wrap text-sm text-zinc-600">
              Marketplace: <span className="font-semibold text-zinc-900 bg-zinc-100 px-2.5 py-1 rounded-md border border-zinc-200">{incident.marketplace}</span>
              {incident.profiles && <><span className="text-zinc-300 mx-1">·</span> PIC: <span className="font-semibold text-zinc-900">{incident.profiles.full_name || incident.profiles.email}</span></>}
            </div>
          )}
        </div>

        {/* WAREHOUSE HANDOFF PANEL */}
        {(waitingOnWarehouse || (userRole === 'warehouse' && sm.isOpen)) && !isEditing && (
          <div className="mb-6 bg-orange-50 border border-orange-200 rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-orange-900">Warehouse fulfillment</h2>
                <p className="text-sm text-orange-800 mt-1">
                  {waitingOnWarehouse
                    ? 'CS has requested warehouse action on this case.'
                    : 'Update fulfillment status when you pick up this case.'}
                </p>
                {incident.warehouse_requested_at && (
                  <p className="text-xs text-orange-700 mt-2 font-medium">
                    Requested {new Date(incident.warehouse_requested_at).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-3 min-w-[200px] sm:min-w-[220px]">
                <div>
                  <label className="app-label text-orange-900">Warehouse status</label>
                  <select
                    value={incident.warehouse_status || ''}
                    onChange={(e) => handleWarehouseStatusChange(e.target.value)}
                    className="app-select w-full border-orange-300"
                  >
                    {WAREHOUSE_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o || 'Select...'}</option>)}
                  </select>
                </div>
                {canNotifyCs && (
                  <button
                    type="button"
                    onClick={() => setShowCsNotify(true)}
                    className="w-full text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg transition"
                  >
                    Email CS team
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ATTACHMENTS */}
        <div className="app-card mb-6">
          <div className="px-5 py-4 border-b border-zinc-100 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-zinc-900">Attachments <span className="ml-2 font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded text-xs">{attachments.length}</span></h2>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="app-btn-primary text-xs py-2">{isUploading ? 'Uploading…' : 'Upload files'}</button>
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx" onChange={handleFileUpload} className="hidden" />
          </div>
          <div className="px-5 py-4">
            {attachments.length === 0 ? (
              <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full border border-dashed border-zinc-300 rounded-xl p-10 text-center hover:border-blue-400 hover:bg-blue-50/40 transition">
                <p className="text-sm font-medium text-zinc-600">Click to upload photos and files</p>
              </button>
            ) : (
              <AttachmentGallery attachments={attachments} onDelete={handleDeleteAttachment} />
            )}
          </div>
        </div>

        {showDeleteCase && (
          <div className="app-card border-red-200 bg-red-50/50 p-5 mb-6">
            <h2 className="text-sm font-semibold text-red-900">Admin: delete case</h2>
            <p className="text-sm text-red-800/90 mt-1 mb-4">
              Remove this incident entirely if it was logged by mistake. Only managers can do this.
            </p>
            <button
              type="button"
              onClick={() => void handleDeleteCase()}
              disabled={isDeletingCase || isEditing}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-50"
            >
              {isDeletingCase ? 'Deleting…' : 'Delete this case'}
            </button>
          </div>
        )}

        {/* COMMENTS */}
        <div className="app-card">
          <div className="px-5 py-4 border-b border-zinc-100">
            <h2 className="text-sm font-semibold text-zinc-900">Conversation <span className="ml-2 font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded text-xs">{comments.length}</span></h2>
          </div>
          <div className="px-5 py-5 space-y-5 max-h-[480px] overflow-y-auto">
            {comments.map((comment, i) => {
              const isMe = comment.user_id === currentUserId
              const showAv = i === 0 || comments[i - 1].user_id !== comment.user_id
              return (
                <div key={comment.id} className={`flex items-end gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className="w-9">{showAv && <div className="w-9 h-9 rounded-full bg-zinc-200 text-zinc-800 text-xs font-semibold flex items-center justify-center border border-white">{comment.profiles?.full_name ? comment.profiles.full_name[0] : 'A'}</div>}</div>
                  <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                    {showAv && <div className={`flex gap-2 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}><span className="text-xs font-semibold text-zinc-800">{isMe ? 'You' : comment.profiles?.full_name}</span><span className="text-xs text-zinc-500">{formatTime(comment.created_at)}</span></div>}
                    <div className={`px-4 py-2.5 rounded-xl text-sm border whitespace-pre-wrap ${isMe ? 'bg-blue-600 border-blue-700 text-white rounded-br-sm' : 'bg-zinc-100 border-zinc-200 text-zinc-900 rounded-bl-sm'}`}>
                      <CommentBody
                        text={comment.comment_text}
                        highlightClassName={
                          isMe
                            ? 'font-semibold underline decoration-white/40'
                            : 'font-semibold text-blue-700'
                        }
                      />
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
          <div className="px-5 py-4 border-t border-zinc-100 bg-zinc-50 rounded-b-xl">
            <form onSubmit={handleSubmitComment} className="flex gap-2 items-end">
              <MentionTextarea
                value={newComment}
                onChange={setNewComment}
                members={agents}
                currentUserId={currentUserId}
                disabled={isSubmitting}
                placeholder="Write a comment… (type @ to mention)"
                className="app-input w-full resize-none min-h-[44px] rounded-xl"
                onSubmit={() => void handleSubmitComment()}
              />
              <button type="submit" disabled={isSubmitting || !newComment.trim()} className="app-btn-primary shrink-0 h-[44px] w-12 rounded-xl px-0 self-start mt-0" aria-label="Send comment">↑</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}