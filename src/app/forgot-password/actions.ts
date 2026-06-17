'use server'

import { Resend } from 'resend'
import { redirect } from 'next/navigation'
import { getAppOrigin } from '../../lib/app-origin'
import {
  buildPasswordResetEmailHtml,
  passwordResetSubject,
} from '../../lib/password-reset-email'
import { createAdminClient } from '../../lib/supabase-admin'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function requestPasswordReset(formData: FormData) {
  const email = (formData.get('email') as string).trim().toLowerCase()

  if (!process.env.RESEND_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    redirect(
      `/forgot-password?message=${encodeURIComponent('Password reset is not configured. Contact your administrator.')}`
    )
  }

  const supabase = createAdminClient()
  const redirectTo = `${getAppOrigin()}/auth/callback?next=/reset-password`

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })

  if (error) {
    // Avoid revealing whether the account exists.
    console.error('PASSWORD RESET LINK ERROR:', error.message)
    redirect('/forgot-password?success=1')
  }

  const resetUrl = data.properties?.action_link
  if (!resetUrl) {
    console.error('PASSWORD RESET LINK ERROR: missing action_link')
    redirect('/forgot-password?success=1')
  }

  const from =
    process.env.PASSWORD_RESET_FROM ||
    process.env.REPORT_FROM ||
    'Aeris CS Dashboard <reports@aerisbeaute.com>'

  const { error: sendError } = await resend.emails.send({
    from,
    to: email,
    subject: passwordResetSubject(),
    html: buildPasswordResetEmailHtml({ resetUrl }),
  })

  if (sendError) {
    console.error('PASSWORD RESET EMAIL ERROR:', sendError.message)
    redirect(
      `/forgot-password?message=${encodeURIComponent('Could not send reset email. Please try again later.')}`
    )
  }

  redirect('/forgot-password?success=1')
}
