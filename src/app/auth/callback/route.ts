import { NextResponse } from 'next/server'
import { createClient } from '../../../utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const errorDescription = searchParams.get('error_description')

  if (errorDescription) {
    return NextResponse.redirect(
      `${origin}/login?message=${encodeURIComponent(errorDescription)}`
    )
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const redirectPath = next.startsWith('/') ? next : `/${next}`
      return NextResponse.redirect(`${origin}${redirectPath}`)
    }

    return NextResponse.redirect(
      `${origin}/login?message=${encodeURIComponent(error.message)}`
    )
  }

  return NextResponse.redirect(
    `${origin}/login?message=${encodeURIComponent('Invalid or expired reset link')}`
  )
}
