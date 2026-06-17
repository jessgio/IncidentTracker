'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '../../utils/supabase/server'

export async function resetPassword(formData: FormData) {
  const supabase = await createClient()
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (password !== confirmPassword) {
    redirect(`/reset-password?message=${encodeURIComponent('Passwords do not match')}`)
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    redirect(`/reset-password?message=${encodeURIComponent(error.message)}`)
  }

  await supabase.auth.signOut()

  revalidatePath('/')
  redirect(
    `/login?success=${encodeURIComponent('Password updated. Sign in with your new password.')}`
  )
}
