import { createClient } from '../utils/supabase/server'
import type { UserRole } from './incident-status'

type ManagerAuthSuccess = {
  ok: true
  supabase: Awaited<ReturnType<typeof createClient>>
  user: { id: string; email?: string }
  role: UserRole
}

type ManagerAuthFailure = {
  ok: false
  status: 401 | 403
  error: string
}

export async function requireManager(): Promise<ManagerAuthSuccess | ManagerAuthFailure> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'manager') {
    return { ok: false, status: 403, error: 'Only managers can perform this action.' }
  }

  return { ok: true, supabase, user, role: 'manager' }
}
