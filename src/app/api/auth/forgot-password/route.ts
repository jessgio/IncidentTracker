import { NextResponse } from 'next/server'
import { getRequestOrigin } from '../../../../lib/app-origin'
import { sendPasswordResetEmail } from '../../../../lib/send-password-reset-email'

export async function POST(request: Request) {
  const formData = await request.formData()
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const result = await sendPasswordResetEmail(email, getRequestOrigin(request))

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.reason === 'not_configured' ? 503 : 500 })
  }

  return NextResponse.json({ ok: true })
}
