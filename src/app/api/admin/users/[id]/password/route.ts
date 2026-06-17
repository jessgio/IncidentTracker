import { NextRequest, NextResponse } from 'next/server'
import { requireManager } from '../../../../../../lib/admin-auth'
import { createAdminClient } from '../../../../../../lib/supabase-admin'

type RouteContext = { params: Promise<{ id: string }> }

const MIN_PASSWORD_LENGTH = 8

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireManager()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id: targetUserId } = await context.params
  if (!targetUserId) {
    return NextResponse.json({ error: 'Invalid user id.' }, { status: 400 })
  }

  let body: { password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 }
    )
  }

  const { data: targetProfile } = await auth.supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', targetUserId)
    .single()

  if (!targetProfile) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin.auth.admin.updateUserById(targetUserId, { password })

    if (error) {
      console.error('admin updateUserById error:', error.message)
      return NextResponse.json(
        { error: error.message || 'Could not update password.' },
        { status: 502 }
      )
    }
  } catch (err) {
    console.error('admin password reset error:', err)
    return NextResponse.json(
      { error: 'Password reset is not configured on the server.' },
      { status: 503 }
    )
  }

  return NextResponse.json({
    success: true,
    user: {
      id: targetProfile.id,
      email: targetProfile.email,
      full_name: targetProfile.full_name,
    },
  })
}
