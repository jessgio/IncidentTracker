import { createClient } from '../utils/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from '../components/DashboardClient'

export default async function Dashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <DashboardClient userEmail={user.email || 'Agent'} />
}