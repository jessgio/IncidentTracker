import { createClient } from '../../../utils/supabase/server'
import { redirect } from 'next/navigation'
import CommentThread from './CommentThread'
import type { UserRole } from '../../../lib/incident-status'

export default async function IncidentPage(props: {
  params: Promise<{ id: string }>
}) {
  const params = await props.params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const userRole = (profile?.role as UserRole) || 'cs'

  return (
    <CommentThread
      incidentId={params.id}
      currentUserId={user.id}
      userRole={userRole}
    />
  )
}