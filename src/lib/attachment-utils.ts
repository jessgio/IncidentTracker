export type AttachmentItem = {
  id: string
  file_name: string
  file_type: string
  file_url: string
  created_at?: string
}

export type AttachmentKind = 'image' | 'video' | 'pdf' | 'other'

export function attachmentKind(fileType: string, fileName: string): AttachmentKind {
  const ft = (fileType || '').toLowerCase()
  const fn = fileName.toLowerCase()
  if (ft.startsWith('image/')) return 'image'
  if (ft.startsWith('video/')) return 'video'
  if (ft === 'application/pdf' || fn.endsWith('.pdf')) return 'pdf'
  return 'other'
}

export function canPreviewInline(kind: AttachmentKind): boolean {
  return kind === 'image' || kind === 'video' || kind === 'pdf'
}

/** Extract storage object path from a Supabase public URL. */
export function storagePathFromPublicUrl(url: string): string | null {
  const marker = '/incident-attachments/'
  const i = url.indexOf(marker)
  if (i === -1) return null
  return decodeURIComponent(url.slice(i + marker.length).split('?')[0])
}
