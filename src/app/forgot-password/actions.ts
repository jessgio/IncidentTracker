'use server'

import { redirect } from 'next/navigation'
import { getAppOrigin } from '../../lib/app-origin'
import { createClient } from '../../utils/supabase/server'

export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getAppOrigin()}/auth/callback?next=/reset-password`,
  })

  if (error) {
    redirect(`/forgot-password?message=${encodeURIComponent(error.message)}`)
  }

  redirect('/forgot-password?success=1')
}
