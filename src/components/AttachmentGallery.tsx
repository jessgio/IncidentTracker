'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  attachmentKind,
  canPreviewInline,
  type AttachmentItem,
  type AttachmentKind,
} from '../lib/attachment-utils'

type Props = {
  attachments: AttachmentItem[]
  onDelete: (attachment: AttachmentItem) => Promise<void>
  emptyLabel?: string
}

async function downloadAttachment(url: string, filename: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(blobUrl)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

function PreviewContent({ att, kind }: { att: AttachmentItem; kind: AttachmentKind }) {
  if (kind === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={att.file_url}
        alt={att.file_name}
        className="max-h-[min(80vh,900px)] max-w-full object-contain rounded-lg shadow-2xl"
      />
    )
  }
  if (kind === 'video') {
    return (
      <video
        src={att.file_url}
        controls
        autoPlay
        className="max-h-[min(80vh,900px)] max-w-full rounded-lg shadow-2xl bg-black"
      >
        <track kind="captions" />
      </video>
    )
  }
  if (kind === 'pdf') {
    return (
      <iframe
        src={att.file_url}
        title={att.file_name}
        className="w-[min(92vw,900px)] h-[min(80vh,800px)] rounded-lg bg-white shadow-2xl border border-zinc-700"
      />
    )
  }
  return (
    <div className="app-card p-8 max-w-md text-center">
      <p className="text-sm text-zinc-700 mb-4">Preview is not available for this file type.</p>
      <a
        href={att.file_url}
        target="_blank"
        rel="noopener noreferrer"
        className="app-btn-primary"
      >
        Open in new tab
      </a>
    </div>
  )
}

function kindLabel(kind: AttachmentKind): string {
  if (kind === 'image') return 'Photo'
  if (kind === 'video') return 'Video'
  if (kind === 'pdf') return 'PDF'
  return 'File'
}

export function AttachmentGallery({ attachments, onDelete, emptyLabel }: Props) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const previewAtt = previewIndex !== null ? attachments[previewIndex] : null
  const previewKind = previewAtt ? attachmentKind(previewAtt.file_type, previewAtt.file_name) : null

  const closePreview = useCallback(() => setPreviewIndex(null), [])

  const goPrev = useCallback(() => {
    setPreviewIndex(i => (i === null || attachments.length === 0 ? null : (i - 1 + attachments.length) % attachments.length))
  }, [attachments.length])

  const goNext = useCallback(() => {
    setPreviewIndex(i => (i === null || attachments.length === 0 ? null : (i + 1) % attachments.length))
  }, [attachments.length])

  useEffect(() => {
    if (previewIndex !== null && previewIndex >= attachments.length) {
      setPreviewIndex(attachments.length > 0 ? Math.min(previewIndex, attachments.length - 1) : null)
    }
  }, [attachments.length, previewIndex])

  useEffect(() => {
    if (previewIndex === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [previewIndex, closePreview, goPrev, goNext])

  const openPreview = (index: number) => {
    const att = attachments[index]
    const kind = attachmentKind(att.file_type, att.file_name)
    if (canPreviewInline(kind)) {
      setPreviewIndex(index)
    } else {
      window.open(att.file_url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleDelete = async (e: React.MouseEvent, att: AttachmentItem) => {
    e.stopPropagation()
    if (!window.confirm(`Delete "${att.file_name}"? This cannot be undone.`)) return
    setDeletingId(att.id)
    try {
      await onDelete(att)
      if (previewAtt?.id === att.id) closePreview()
    } finally {
      setDeletingId(null)
    }
  }

  if (attachments.length === 0) {
    return emptyLabel ? (
      <p className="text-sm text-zinc-600 text-center py-6">{emptyLabel}</p>
    ) : null
  }

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {attachments.map((att, index) => {
          const kind = attachmentKind(att.file_type, att.file_name)
          const isImg = kind === 'image'
          const previewable = canPreviewInline(kind)
          const isDeleting = deletingId === att.id

          return (
            <div
              key={att.id}
              className={`group relative rounded-xl overflow-hidden border border-zinc-200 aspect-square bg-zinc-50 flex flex-col ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <button
                type="button"
                onClick={() => openPreview(index)}
                className="absolute inset-0 z-0 flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
                title={previewable ? `View ${att.file_name}` : `Open ${att.file_name}`}
              >
                {isImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={att.file_url}
                    alt={att.file_name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover group-hover:opacity-90 transition"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-4 h-full w-full group-hover:bg-zinc-100 transition">
                    <span className="text-xs font-semibold text-zinc-500 mb-1">{kindLabel(kind)}</span>
                    <span className="text-xs font-medium text-zinc-800 text-center line-clamp-3 px-2">{att.file_name}</span>
                  </div>
                )}
                <span className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition pointer-events-none">
                  <span className="text-white text-xs font-semibold bg-black/50 px-2.5 py-1 rounded-md">
                    {previewable ? 'View' : 'Open'}
                  </span>
                </span>
              </button>

              <div className="absolute top-2 right-2 z-10 flex gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void downloadAttachment(att.file_url, att.file_name)
                  }}
                  className="bg-white/95 hover:bg-white text-zinc-700 text-[10px] font-semibold px-2 py-1 rounded-md shadow border border-zinc-200 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition"
                  title="Download"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={(e) => void handleDelete(e, att)}
                  disabled={!!deletingId}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold w-7 h-7 rounded-md shadow opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition disabled:opacity-50"
                  title="Delete"
                  aria-label={`Delete ${att.file_name}`}
                >
                  ×
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {previewAtt && previewKind && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-zinc-950/95"
          role="dialog"
          aria-modal="true"
          aria-label={`Viewing ${previewAtt.file_name}`}
          onClick={closePreview}
        >
          <div
            className="flex flex-col h-full min-h-0"
            onClick={e => e.stopPropagation()}
          >
          <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0 border-b border-zinc-800">
            <p className="text-sm font-medium text-white truncate min-w-0">{previewAtt.file_name}</p>
            <div className="flex items-center gap-2 shrink-0">
              {attachments.length > 1 && (
                <span className="text-xs text-zinc-400 tabular-nums hidden sm:inline">
                  {(previewIndex ?? 0) + 1} / {attachments.length}
                </span>
              )}
              <button
                type="button"
                onClick={() => void downloadAttachment(previewAtt.file_url, previewAtt.file_name)}
                className="text-xs font-semibold text-zinc-200 hover:text-white px-3 py-1.5 rounded-lg border border-zinc-600 hover:border-zinc-500 transition"
              >
                Download
              </button>
              <button
                type="button"
                onClick={(e) => void handleDelete(e, previewAtt)}
                disabled={!!deletingId}
                className="text-xs font-semibold text-red-300 hover:text-white px-3 py-1.5 rounded-lg border border-red-800 hover:bg-red-900/50 transition disabled:opacity-50"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={closePreview}
                className="text-xs font-semibold text-white bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>

          <div className="relative flex-1 flex items-center justify-center p-4 min-h-0">
            {attachments.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  className="absolute left-2 sm:left-4 z-10 w-10 h-10 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-white text-lg font-semibold shadow-lg transition"
                  aria-label="Previous file"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="absolute right-2 sm:right-4 z-10 w-10 h-10 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-white text-lg font-semibold shadow-lg transition"
                  aria-label="Next file"
                >
                  ›
                </button>
              </>
            )}
            <PreviewContent att={previewAtt} kind={previewKind} />
          </div>
          </div>
        </div>
      )}
    </>
  )
}
