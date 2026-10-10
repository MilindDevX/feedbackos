// ABOUTME: Gives Postgres connections enough time to reach a Neon branch that is waking from archive/suspend.
const NEON_WAKE_SECONDS = 30

export function withConnectTimeout(url: string | undefined): string | undefined {
  if (!url) return url
  try {
    const parsed = new URL(url)
    if (!parsed.searchParams.has('connect_timeout')) parsed.searchParams.set('connect_timeout', String(NEON_WAKE_SECONDS))
    return parsed.toString()
  } catch {
    return url
  }
}
