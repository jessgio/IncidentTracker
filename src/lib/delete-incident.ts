import type { SupabaseClient } from '@supabase/supabase-js'
import { storagePathFromPublicUrl } from './attachment-utils'

export async function deleteIncident(
  supabase: SupabaseClient,
  incidentId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: attachments, error: attErr } = await supabase
    .from('attachments')
    .select('file_url')
    .eq('incident_id', incidentId)

  if (attErr) {
    return { ok: false, error: attErr.message }
  }

  const paths = (attachments ?? [])
    .map(a => storagePathFromPublicUrl(a.file_url))
    .filter((p): p is string => Boolean(p))

  if (paths.length > 0) {
    const { error: storageErr } = await supabase.storage
      .from('incident-attachments')
      .remove(paths)
    if (storageErr) {
      return { ok: false, error: storageErr.message }
    }
  }

  const { data, error } = await supabase.rpc('delete_incident', {
    p_incident_id: incidentId,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  if (data !== true) {
    return { ok: false, error: 'Case not found or could not be deleted.' }
  }

  return { ok: true }
}
