export function getAppOrigin(fallbackOrigin?: string) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    fallbackOrigin?.replace(/\/$/, '') ||
    'https://aeris-cs-dashboard.vercel.app'
  )
}
