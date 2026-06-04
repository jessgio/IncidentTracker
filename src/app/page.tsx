import { createClient } from '../utils/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from '../components/DashboardClient'
import type { UserRole } from '../lib/incident-status'

export default async function Dashboard() {
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
    <DashboardClient
      userId={user.id}
      userEmail={user.email || 'Agent'}
      userRole={userRole}
    />
  )
}