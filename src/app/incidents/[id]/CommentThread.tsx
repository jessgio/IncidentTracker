'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../../utils/supabase/client'
import {
  incidentExtraFields, emptyExtraFormState, extraFormToDbPayload, incidentToExtraForm, formatExtraValue,
  type ExtraFormState, type IncidentExtraDbFields, type ExtraFieldKey
} from '../../../lib/incident-extra-fields'

type Attachment = { id: string; file_name: string; file_type: string; file_url: string; created_at: string }
type Comment = { id: string; comment_text: string; created_at: string; user_id: string; profiles: { full_name: string; email: string } }
type Incident = {
  id: string; title: string; status: string; category: string; marketplace: string;
  order_number: string; complaint_date: string; created_at: string; assigned_to: string | null;
  ai_suggestion: string | null; profiles: { full_name: string; email: string } | null
} & IncidentExtraDbFields

type Profile = { id: string; full_name: string; email: string }

const statusColors: Record<string, string> = { 'Not Started': 'bg-rose-50 text-rose-800 border-2 border-rose-300', 'In Progress': 'bg-amber-50 text-amber-800 border-2 border-amber-300', 'Completed': 'bg-emerald-50 text-emerald-800 border-2 border-emerald-300' }
const colorMap: Record<string, string> = { blue: 'bg-blue-50 text-blue-800 ring-blue-300', purple: 'bg-purple-50 text-purple-800 ring-purple-300', rose: 'bg-rose-50 text-rose-800 ring-rose-300', slate: 'bg-slate-100 text-slate-800 ring-slate-300', amber: 'bg-amber-50 text-amber-800 ring-amber-300', emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-300', cyan: 'bg-cyan-50 text-cyan-800 ring-cyan-300', pink: 'bg-pink-50 text-pink-800 ring-pink-300', indigo: 'bg-indigo-50 text-indigo-800 ring-indigo-300', orange: 'bg-orange-50 text-orange-800 ring-orange-300' }

export default function CommentThread({ incidentId, currentUserId, currentUserEmail }: { incidentId: string; currentUserId: string; currentUserEmail: string }) {
  const [incident, setIncident] = useState<Incident | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [agents, setAgents] = useState<Profile[]>([])
  const [categories, setCategories] = useState<{ name: string; color: string }[]>([])
  const [marketplaces, setMarketplaces] = useState<{ id: string; name: string }[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  
  const [newComment, setNewComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editOrderNumber, setEditOrderNumber] = useState('')
  const [editComplaintDate, setEditComplaintDate] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editMarketplace, setEditMarketplace] = useState('')
  const [editExtraForm, setEditExtraForm] = useState<ExtraFormState>({ ...emptyExtraFormState })

  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [comments])

  const fetchAll = async () => {
    const { data: incData } = await supabase.from('incidents').select('*, profiles(full_name, email)').eq('id', incidentId).single()
    if (incData) setIncident(incData)
    const { data: commentData } = await supabase.from('comments').select('*, profiles(full_name, email)').eq('incident_id', incidentId).order('created_at', { ascending: true })
    if (commentData) setComments(commentData as Comment[])
    const { data: agentData } = await supabase.from('profiles').select('*'); if (agentData) setAgents(agentData)
    const { data: catData } = await supabase.from('categories').select('*').order('name'); if (catData) setCategories(catData)
    const { data: mpData } = await supabase.from('marketplaces').select('*').order('name'); if (mpData) setMarketplaces(mpData)
    const { data: attachmentData } = await supabase.from('attachments').select('*').eq('incident_id', incidentId).order('created_at', { ascending: true })
    if (attachmentData) setAttachments(attachmentData)
  }

  useEffect(() => {
    fetchAll()
    const channel = supabase.channel(`comments_${incidentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `incident_id=eq.${incidentId}` }, () => fetchAll())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'incidents', filter: `id=eq.${incidentId}` }, () => fetchAll()).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [incidentId])

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

  const handleDeleteAttachment = async (attachment: Attachment) => {
    const path = attachment.file_url.split('/incident-attachments/')[1]
    await supabase.storage.from('incident-attachments').remove([path])
    await supabase.from('attachments').delete().eq('id', attachment.id)
    await fetchAll()
  }

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault(); if (!newComment.trim()) return; setIsSubmitting(true)
    await supabase.from('comments').insert([{ incident_id: incidentId, user_id: currentUserId, comment_text: newComment.trim() }])
    setNewComment(''); setIsSubmitting(false)
  }

  const handleStatusChange = async (newStatus: string) => {
    if (incident) setIncident({ ...incident, status: newStatus })
    await supabase.from('incidents').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', incidentId)
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

  if (!incident) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-600 font-bold text-sm">Loading incident...</div>

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30">
      <div className="max-w-[95%] lg:max-w-5xl mx-auto p-4 md:p-8">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-blue-700 transition mb-6">← Back to Dashboard</a>

        {/* INCIDENT DETAILS */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl border-2 border-slate-200 shadow-sm p-7 mb-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            
            <div className="flex-1 w-full">
              {!isEditing ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ring-1 ring-inset ${colorMap[categories.find(c => c.name === incident.category)?.color || 'slate']}`}>{incident.category}</span>
                      <span className="text-xs text-slate-800 font-mono font-bold bg-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-300">#{incident.order_number}</span>
                    </div>
                    <button onClick={startEditing} className="font-bold text-slate-700 hover:text-blue-700 transition flex items-center gap-1.5 text-xs bg-slate-100 hover:bg-blue-50 px-3 py-2 rounded-lg border-2 border-slate-200 hover:border-blue-300 shadow-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" /></svg>
                      Edit Case
                    </button>
                  </div>
                  <h1 className="text-2xl font-black text-slate-900 mb-2 leading-relaxed">{incident.title}</h1>
                  <p className="text-sm font-medium text-slate-600 mt-2">Logged {new Date(incident.created_at).toLocaleDateString('en-US', { dateStyle: 'long'})} <span className="mx-2 text-slate-300">|</span> Complaint date: <span className="text-slate-800 font-bold">{incident.complaint_date ? new Date(incident.complaint_date).toLocaleDateString() : '—'}</span></p>
                  
                  {/* DISPLAY EXTRA FIELDS (VIEW MODE) */}
                  <div className="mt-8 border-t-2 border-slate-100 pt-5">
                    <h3 className="text-sm font-black text-slate-800 mb-5 uppercase tracking-wider">Additional Details</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-6">
                      {incidentExtraFields.map(field => {
                        const val = incident[field.key as keyof IncidentExtraDbFields]
                        if (val === null || val === undefined || val === '') return null;
                        return (
                          <div key={field.key} className={field.type === 'textarea' ? 'col-span-2 md:col-span-3' : ''}>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{field.label}</p>
                            <p className="text-sm font-medium text-slate-900 whitespace-pre-wrap leading-relaxed bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl">{formatExtraValue(val, field.type)}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-5">
                  <div><label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Issue Description</label><textarea value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full border-2 border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-900" rows={2} /></div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Order #</label><input value={editOrderNumber} onChange={(e) => setEditOrderNumber(e.target.value)} className="w-full border-2 border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-900" /></div>
                    <div><label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Date</label><input type="date" value={editComplaintDate} onChange={(e) => setEditComplaintDate(e.target.value)} className="w-full border-2 border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-900" /></div>
                    <div><label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Category</label><select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="w-full border-2 border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-900"><option value="">Select</option>{categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select></div>
                    <div><label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Marketplace</label><select value={editMarketplace} onChange={(e) => setEditMarketplace(e.target.value)} className="w-full border-2 border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-900"><option value="">Select</option>{marketplaces.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}</select></div>
                  </div>
                  
                  {/* EDIT EXTRA FIELDS */}
                  <div className="border-t-2 border-slate-100 pt-5 mt-2">
                    <h3 className="text-sm font-black text-slate-800 mb-4 uppercase tracking-wider">Additional Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {incidentExtraFields.map(field => (
                        <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                          <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">{field.label}</label>
                          {field.type === 'textarea' ? (
                            <textarea value={editExtraForm[field.key as ExtraFieldKey]} onChange={(e) => setEditExtraForm(p=>({ ...p, [field.key]: e.target.value }))} rows={2} className="w-full bg-slate-50 border-2 border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-900 resize-y placeholder:text-slate-400" placeholder={(field as any).placeholder} />
                          ) : field.type === 'select' ? (
                            <select value={editExtraForm[field.key as ExtraFieldKey]} onChange={(e) => setEditExtraForm(p=>({ ...p, [field.key]: e.target.value }))} className="w-full bg-slate-50 border-2 border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-900">
                              {(field as any).options?.map((o: string) => <option key={o} value={o}>{o || 'Select...'}</option>)}
                            </select>
                          ) : (
                            <input type={field.type === 'money' ? 'number' : field.type} step={field.type==='money'?'0.01':undefined} value={editExtraForm[field.key as ExtraFieldKey]} onChange={(e) => setEditExtraForm(p=>({ ...p, [field.key]: e.target.value }))} placeholder={(field as any).placeholder} className="w-full bg-slate-50 border-2 border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-200 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <button onClick={() => setIsEditing(false)} className="px-5 py-2.5 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition">Cancel</button>
                    <button onClick={handleSaveEdit} disabled={isSubmitting} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-sm transition disabled:bg-slate-400">
                      {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!isEditing && (
              <div className="flex flex-col gap-4 min-w-[220px] border-t-2 md:border-t-0 md:border-l-2 border-slate-100 pt-5 md:pt-0 md:pl-6">
                <div><label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Status</label><select value={incident.status} onChange={(e) => handleStatusChange(e.target.value)} className={`w-full text-sm font-bold px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 ${statusColors[incident.status]}`}><option>Not Started</option><option>In Progress</option><option>Completed</option></select></div>
                <div><label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Assigned To</label><select value={incident.assigned_to || ''} onChange={(e) => handleAssigneeChange(e.target.value)} className="w-full text-sm font-medium text-slate-900 px-4 py-2.5 rounded-xl border-2 border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-300"><option value="">Unassigned</option>{agents.map(a => <option key={a.id} value={a.id}>{a.full_name || a.email}</option>)}</select></div>
              </div>
            )}
          </div>
          
          {!isEditing && (
            <div className="mt-6 pt-5 border-t-2 border-slate-100 flex items-center gap-2 flex-wrap text-sm text-slate-600 font-medium">
              Marketplace: <span className="font-bold text-slate-900 bg-slate-200 px-3 py-1 rounded-lg border border-slate-300">{incident.marketplace}</span>
              {incident.profiles && <><span className="text-slate-300 mx-2">|</span> PIC: <span className="font-bold text-slate-900 ml-1">{incident.profiles.full_name || incident.profiles.email}</span></>}
            </div>
          )}
        </div>

        {/* AI DRAFT RESPONSE */}
        {incident.ai_suggestion && (
          <div className="mb-6"><div className="flex gap-4 bg-violet-50 border-2 border-violet-200 rounded-2xl p-6 shadow-sm">
            <span className="text-violet-600 font-black text-xl">❖</span><div><p className="text-sm font-black text-violet-900 mb-2 uppercase tracking-wide">AI Drafted Customer Response</p><p className="text-sm font-medium text-violet-950 leading-relaxed bg-white/60 p-4 rounded-xl border border-violet-100">{incident.ai_suggestion}</p></div>
          </div></div>
        )}

        {/* ATTACHMENTS */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl border-2 border-slate-200 shadow-sm mb-6"><div className="px-7 py-5 border-b-2 border-slate-100 flex justify-between items-center"><h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Attachments <span className="ml-2 font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md text-xs">{attachments.length}</span></h2><button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="text-xs font-bold bg-blue-100 text-blue-700 hover:bg-blue-200 px-4 py-2 rounded-xl transition shadow-sm">{isUploading ? 'Uploading...' : '+ Upload Files'}</button><input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx" onChange={handleFileUpload} className="hidden" /></div><div className="px-7 py-5">{attachments.length === 0 ? <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition"><div className="text-4xl mb-3">📎</div><p className="text-sm font-bold text-slate-500">Click here to upload photos & files</p></div> : <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{attachments.map(att => <div key={att.id} className="group relative rounded-2xl overflow-hidden border-2 border-slate-200 aspect-square bg-slate-50">{att.file_type.startsWith('image') ? <a href={att.file_url} target="_blank"><img src={att.file_url} className="w-full h-full object-cover" /></a> : <a href={att.file_url} target="_blank" className="flex flex-col items-center justify-center p-4 h-full hover:bg-slate-100 transition"><div className="text-4xl mb-2">📄</div><span className="text-xs font-bold text-slate-800 text-center line-clamp-2 px-2">{att.file_name}</span></a>}<button onClick={() => handleDeleteAttachment(att)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-rose-500 hover:bg-rose-600 text-white w-7 h-7 rounded-full text-sm font-bold shadow-md transition-all">×</button></div>)}</div>}</div></div>

        {/* COMMENTS */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl border-2 border-slate-200 shadow-sm">
          <div className="px-7 py-5 border-b-2 border-slate-100">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Conversation <span className="ml-2 font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md text-xs">{comments.length}</span></h2>
          </div>
          <div className="px-7 py-6 space-y-6 max-h-[480px] overflow-y-auto">
            {comments.map((comment, i) => {
              const isMe = comment.user_id === currentUserId
              const showAv = i === 0 || comments[i - 1].user_id !== comment.user_id
              return (
                <div key={comment.id} className={`flex items-end gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className="w-9">{showAv && <div className="w-9 h-9 rounded-full bg-slate-300 text-slate-800 text-xs font-black flex items-center justify-center border-2 border-white shadow-sm">{comment.profiles?.full_name ? comment.profiles.full_name[0] : 'A'}</div>}</div>
                  <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                    {showAv && <div className={`flex gap-2 mb-1.5 ${isMe ? 'flex-row-reverse' : ''}`}><span className="text-xs font-black text-slate-800">{isMe ? 'You' : comment.profiles?.full_name}</span><span className="text-xs font-bold text-slate-400">{formatTime(comment.created_at)}</span></div>}
                    <div className={`px-5 py-3 rounded-2xl text-sm font-medium shadow-sm border ${isMe ? 'bg-blue-600 border-blue-700 text-white rounded-br-sm' : 'bg-slate-100 border-slate-200 text-slate-900 rounded-bl-sm'}`}>{comment.comment_text}</div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
          <div className="px-7 py-5 border-t-2 border-slate-100 bg-slate-50/80 rounded-b-2xl">
            <form onSubmit={handleSubmitComment} className="flex gap-3 items-end">
               <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitComment(e) } }} placeholder="Write a comment..." rows={1} className="flex-1 border-2 border-slate-300 rounded-2xl px-5 py-3 text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200 bg-white placeholder:text-slate-400 resize-none min-h-[48px]" />
              <button type="submit" disabled={isSubmitting || !newComment.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-black w-14 h-[48px] rounded-2xl transition shadow-sm flex items-center justify-center">⇧</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}