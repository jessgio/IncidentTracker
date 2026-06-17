export function getAppOrigin(fallbackOrigin?: string) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    fallbackOrigin?.replace(/\/$/, '') ||
    'https://aeris-cs-dashboard.vercel.app'
  )
}

export function getRequestOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (origin) {
    return origin.replace(/\/$/, '')
  }

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  if (host) {
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    return `${protocol}://${host}`.replace(/\/$/, '')
  }

  return getAppOrigin()
}
