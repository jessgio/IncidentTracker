'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../../utils/supabase/client'

// --- TYPES ---
type Attachment = { id: string; file_name: string; file_type: string; file_url: string; created_at: string }
type Comment = { id: string; comment_text: string; created_at: string; user_id: string; profiles: { full_name: string; email: string } }
type Incident = {
  id: string; title: string; status: string; category: string; marketplace: string;
  order_number: string; complaint_date: string; created_at: string; assigned_to: string | null;
  ai_suggestion: string | null; profiles: { full_name: string; email: string } | null
}
type Profile = { id: string; full_name: string; email: string }
type Category = { name: string; color: string }
type Marketplace = { id: string; name: string }

// --- CONSTANTS ---
const statusColors: Record<string, string> = {
  'Not Started': 'bg-rose-50 text-rose-700 ring-rose-200',
  'In Progress': 'bg-amber-50 text-amber-700 ring-amber-200',
  'Completed': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

const colorMap: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-200', purple: 'bg-purple-50 text-purple-700 ring-purple-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200', slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200', emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-200', pink: 'bg-pink-50 text-pink-700 ring-pink-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200', orange: 'bg-orange-50 text-orange-700 ring-orange-200',
}

// --- MAIN COMPONENT ---
export default function CommentThread({
  incidentId,
  currentUserId,
  currentUserEmail,
}: {
  incidentId: string
  currentUserId: string
  currentUserEmail: string
}) {
  const [incident, setIncident] = useState<Incident | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [agents, setAgents] = useState<Profile[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  
  const [newComment, setNewComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  // Edit Mode States
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editOrderNumber, setEditOrderNumber] = useState('')
  const [editComplaintDate, setEditComplaintDate] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editMarketplace, setEditMarketplace] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  const fetchAll = async () => {
    const { data: incData } = await supabase
      .from('incidents')
      .select('*, profiles(full_name, email)')
      .eq('id', incidentId)
      .single()
    if (incData) setIncident(incData)

    const { data: commentData } = await supabase
      .from('comments')
      .select('*, profiles(full_name, email)')
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: true })
    if (commentData) setComments(commentData as Comment[])

    const { data: agentData } = await supabase.from('profiles').select('*')
    if (agentData) setAgents(agentData)

    const { data: catData } = await supabase.from('categories').select('*').order('name')
    if (catData) setCategories(catData)

    const { data: mpData } = await supabase.from('marketplaces').select('*').order('name')
    if (mpData) setMarketplaces(mpData)

    const { data: attachmentData } = await supabase
      .from('attachments')
      .select('*')
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: true })
    if (attachmentData) setAttachments(attachmentData)
  }

  useEffect(() => {
    fetchAll()
    const channel = supabase
      .channel(`comments_${incidentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `incident_id=eq.${incidentId}` }, () => fetchAll())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'incidents', filter: `id=eq.${incidentId}` }, () => fetchAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [incidentId])

  // Handlers
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setIsUploading(true)

    for (const file of Array.from(files)) {
      const fileExt = file.name.split('.').pop()
      const fileName = `${incidentId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`
      const { data: uploadData, error: uploadError } = await supabase.storage.from('incident-attachments').upload(fileName, file)

      if (!uploadError && uploadData) {
        const { data: urlData } = supabase.storage.from('incident-attachments').getPublicUrl(uploadData.path)
        await supabase.from('attachments').insert([{
          incident_id: incidentId, user_id: currentUserId, file_name: file.name, file_type: file.type, file_url: urlData.publicUrl,
        }])
      }
    }
    await fetchAll()
    setIsUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDeleteAttachment = async (attachment: Attachment) => {
    const path = attachment.file_url.split('/incident-attachments/')[1]
    await supabase.storage.from('incident-attachments').remove([path])
    await supabase.from('attachments').delete().eq('id', attachment.id)
    await fetchAll()
  }

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return
    setIsSubmitting(true)
    await supabase.from('comments').insert([{ incident_id: incidentId, user_id: currentUserId, comment_text: newComment.trim() }])
    setNewComment('')
    setIsSubmitting(false)
  }

  const handleStatusChange = async (newStatus: string) => {
    // 1. Optimistic Update
    if (incident) {
      setIncident({ ...incident, status: newStatus })
    }
    
    // 2. Background DB save
    await supabase
      .from('incidents')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', incidentId)
  }

  const handleAssigneeChange = async (newAssigneeId: string) => {
    // 1. Optimistic Update (Find the agent's name/email to instantly update the profile badge too)
    const assignedAgent = agents.find(a => a.id === newAssigneeId) || null
    if (incident) {
      setIncident({ 
        ...incident, 
        assigned_to: newAssigneeId || null,
        profiles: assignedAgent ? { full_name: assignedAgent.full_name, email: assignedAgent.email } : null
      })
    }

    // 2. Background DB save
    await supabase
      .from('incidents')
      .update({ assigned_to: newAssigneeId || null, updated_at: new Date().toISOString() })
      .eq('id', incidentId)
  }

  // --- EDIT FUNCTIONS ---
  const startEditing = () => {
    if (!incident) return
    setEditTitle(incident.title)
    setEditOrderNumber(incident.order_number || '')
    setEditComplaintDate(incident.complaint_date || '')
    setEditCategory(incident.category || '')
    setEditMarketplace(incident.marketplace || '')
    setIsEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!editTitle) return
    setIsSubmitting(true)
    await supabase.from('incidents').update({
      title: editTitle,
      order_number: editOrderNumber,
      complaint_date: editComplaintDate,
      category: editCategory,
      marketplace: editMarketplace,
      updated_at: new Date().toISOString()
    }).eq('id', incidentId)
    
    setIsSubmitting(false)
    setIsEditing(false)
    fetchAll()
  }

  // Formatting helpers
  const getAvatarColor = (str: string) => {
    const colors = ['bg-blue-400', 'bg-purple-400', 'bg-rose-400', 'bg-amber-400', 'bg-emerald-400', 'bg-cyan-400', 'bg-indigo-400', 'bg-pink-400']
    let hash = 0; for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length]
  }

  const getInitials = (name: string, email: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : email[0].toUpperCase()

  const formatTime = (timestamp: string) => {
    const diffMins = Math.floor((new Date().getTime() - new Date(timestamp).getTime()) / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    if (diffMins < 10080) return `${Math.floor(diffMins / 1440)}d ago`
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (!incident) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm">Loading incident...</div>

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30">
      <div className="max-w-5xl mx-auto p-6 md:p-10">
        <a href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition mb-6">← Back to Dashboard</a>

        {/* INCIDENT HEADER CARD */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm p-7 mb-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            
            {/* LEFT SIDE (Display OR Edit Form) */}
            <div className="flex-1 w-full">
              {!isEditing ? (
                <>
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset ${colorMap[categories.find(c => c.name === incident.category)?.color || 'slate']}`}>
                      {incident.category}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">#{incident.order_number}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <h1 className="text-2xl font-bold text-slate-900 mb-1 leading-relaxed">{incident.title}</h1>
                    <button onClick={startEditing} className="flex-shrink-0 mt-1 text-slate-400 hover:text-blue-600 transition flex items-center gap-1.5 text-xs font-medium bg-slate-50 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-blue-200">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" /></svg>
                      Edit
                    </button>
                  </div>
                  <p className="text-sm text-slate-500 mt-2">
                    Logged on {new Date(incident.created_at).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    {' · '}
                    Complaint date: {incident.complaint_date ? new Date(incident.complaint_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </p>
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Issue Description</label>
                    <textarea 
                      value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-white border border-slate-300 px-3 py-2 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200" rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Order #</label>
                      <input value={editOrderNumber} onChange={(e) => setEditOrderNumber(e.target.value)} className="w-full bg-white border border-slate-300 px-3 py-2 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                      <input type="date" value={editComplaintDate} onChange={(e) => setEditComplaintDate(e.target.value)} className="w-full bg-white border border-slate-300 px-3 py-2 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
                        <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="w-full bg-white border border-slate-300 px-3 py-2 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200">
                        {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Marketplace</label>
                        <select value={editMarketplace} onChange={(e) => setEditMarketplace(e.target.value)} className="w-full bg-white border border-slate-300 px-3 py-2 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200">
                        {marketplaces.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                        </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition">Cancel</button>
                    <button onClick={handleSaveEdit} disabled={isSubmitting} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium rounded-lg shadow-sm transition">
                      {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT SIDE (STATUS & ASSIGNEE CONTROLS) */}
            {!isEditing && (
              <div className="flex flex-col gap-3 min-w-[200px] border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
                  <select value={incident.status} onChange={(e) => handleStatusChange(e.target.value)}
                    className={`w-full text-sm font-medium px-3 py-2 rounded-xl ring-1 ring-inset cursor-pointer appearance-none border-0 outline-none transition ${statusColors[incident.status]}`}>
                    <option>Not Started</option><option>In Progress</option><option>Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Assigned To (PIC)</label>
                  <select value={incident.assigned_to || ''} onChange={(e) => handleAssigneeChange(e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200 transition cursor-pointer appearance-none">
                    <option value="">Unassigned</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.full_name || a.email}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {!isEditing && (
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500">Marketplace:</span>
              <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">{incident.marketplace}</span>
              {incident.profiles && (
                <><span className="text-slate-300 mx-1">·</span><span className="text-xs text-slate-500">PIC:</span><span className="text-xs font-semibold text-slate-700">{incident.profiles.full_name || incident.profiles.email}</span></>
              )}
            </div>
          )}
        </div>

        {/* AI Suggestion Banner */}
        {incident.ai_suggestion && (
          <div className="mb-6">
            <div className="flex items-start gap-3 bg-violet-50/60 border border-violet-100 rounded-2xl shadow-sm px-5 py-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
              </svg>
              <div>
                <p className="text-sm font-bold text-violet-800 mb-1">AI Suggested Action</p>
                <p className="text-sm text-violet-700 leading-relaxed">{incident.ai_suggestion}</p>
              </div>
            </div>
          </div>
        )}

        {/* ATTACHMENTS */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden mb-6">
          <div className="px-7 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Attachments <span className="ml-2 text-xs font-normal text-slate-400">{attachments.length} files</span></h2>
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="flex items-center gap-2 text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg transition disabled:opacity-50">
              {isUploading ? 'Uploading...' : 'Upload Files'}
            </button>
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx" onChange={handleFileUpload} className="hidden" />
          </div>
          <div className="px-7 py-4">
            {attachments.length === 0 ? (
              <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-200 hover:border-blue-300 rounded-xl p-8 text-center cursor-pointer transition">
                <div className="text-3xl mb-2">📎</div>
                <p className="text-sm text-slate-400">Click to upload photos, videos or documents</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {attachments.map(att => {
                  const isMedia = att.file_type.startsWith('image/') || att.file_type.startsWith('video/')
                  return (
                    <div key={att.id} className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-square flex items-center justify-center">
                      {isMedia ? (
                        <a href={att.file_url} target="_blank" rel="noreferrer" className="w-full h-full">
                          {att.file_type.startsWith('image/') ? <img src={att.file_url} className="w-full h-full object-cover hover:scale-105 transition" /> : <video src={att.file_url} className="w-full h-full object-cover" />}
                        </a>
                      ) : (
                        <a href={att.file_url} target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center p-4 w-full h-full hover:bg-slate-100 transition"><div className="text-3xl">📄</div><span className="text-xs mt-2 line-clamp-2">{att.file_name}</span></a>
                      )}
                      <button onClick={() => handleDeleteAttachment(att)} className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition shadow">×</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* COMMENTS SECTION */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="px-7 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Conversation <span className="ml-2 text-xs font-normal text-slate-400">{comments.length} comments</span></h2>
          </div>
          <div className="px-7 py-5 space-y-5 max-h-[480px] overflow-y-auto">
            {comments.map((comment, i) => {
              const isMe = comment.user_id === currentUserId
              const showAv = i === 0 || comments[i - 1].user_id !== comment.user_id
              return (
                <div key={comment.id} className={`flex items-end gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className="w-8">{showAv && <div className={`w-8 h-8 rounded-full ${getAvatarColor(comment.user_id)} text-white text-xs font-bold flex items-center justify-center`}>{getInitials(comment.profiles?.full_name || '', comment.profiles?.email || '')}</div>}</div>
                  <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                    {showAv && <div className={`flex gap-2 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}><span className="text-xs font-semibold text-slate-700">{isMe ? 'You' : comment.profiles?.full_name || 'Agent'}</span><span className="text-xs text-slate-400">{formatTime(comment.created_at)}</span></div>}
                    <div className={`px-4 py-2.5 rounded-2xl text-sm ${isMe ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'}`}>{comment.comment_text}</div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
          <div className="px-7 py-4 border-t border-slate-100 bg-slate-50/50">
            <form onSubmit={handleSubmitComment} className="flex items-end gap-3">
              <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitComment(e) } }} placeholder="Add a comment..." rows={1} className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none text-slate-900" />
              <button type="submit" disabled={isSubmitting || !newComment.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white w-10 h-10 rounded-xl flex items-center justify-center transition">✈</button>
            </form>
          </div>
        </div>

      </div>
    </div>
  )
}