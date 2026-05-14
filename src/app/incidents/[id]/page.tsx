import { createClient } from '../../../utils/supabase/server'
import { redirect } from 'next/navigation'
import CommentThread from './CommentThread'

export default async function IncidentPage(props: {
  params: Promise<{ id: string }>
}) {
  const params = await props.params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <CommentThread
      incidentId={params.id}
      currentUserId={user.id}
      currentUserEmail={user.email || 'Agent'}
    />
  )
}