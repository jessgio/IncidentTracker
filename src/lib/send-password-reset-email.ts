import { Resend } from 'resend'
import { getAppOrigin } from './app-origin'
import {
  buildPasswordResetEmailHtml,
  buildPasswordResetEmailText,
  passwordResetSubject,
} from './password-reset-email'
import { createAdminClient } from './supabase-admin'

const resend = new Resend(process.env.RESEND_API_KEY)

export type PasswordResetResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'send_failed'; message: string }

export async function sendPasswordResetEmail(
  email: string,
  requestOrigin?: string
): Promise<PasswordResetResult> {
  if (!process.env.RESEND_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('PASSWORD RESET: missing RESEND_API_KEY or SUPABASE_SERVICE_ROLE_KEY')
    return {
      ok: false,
      reason: 'not_configured',
      message: 'Password reset is not configured. Contact your administrator.',
    }
  }

  const supabase = createAdminClient()
  const appOrigin = getAppOrigin(requestOrigin)

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
  })

  if (error) {
    // Avoid revealing whether the account exists.
    console.error('PASSWORD RESET LINK ERROR:', error.message)
    return { ok: true }
  }

  const tokenHash = data.properties?.hashed_token
  if (!tokenHash) {
    console.error('PASSWORD RESET LINK ERROR: missing hashed_token')
    return { ok: true }
  }

  const resetUrl = `${appOrigin}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=recovery&next=${encodeURIComponent('/reset-password')}`

  const from =
    process.env.PASSWORD_RESET_FROM ||
    process.env.REPORT_FROM ||
    'Aeris CS Dashboard <reports@aerisbeaute.com>'

  const { error: sendError } = await resend.emails.send({
    from,
    to: email,
    subject: passwordResetSubject(),
    html: buildPasswordResetEmailHtml({ resetUrl }),
    text: buildPasswordResetEmailText({ resetUrl }),
  })

  if (sendError) {
    console.error('PASSWORD RESET EMAIL ERROR:', sendError.message)
    return {
      ok: false,
      reason: 'send_failed',
      message: 'Could not send reset email. Please try again later.',
    }
  }

  console.info('PASSWORD RESET EMAIL SENT via Resend to', email)
  return { ok: true }
}
