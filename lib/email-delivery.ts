// ABOUTME: Decides how a sign-in link is delivered. Only local development may print it instead of
// ABOUTME: emailing it; a deployed app without a real key must fail loudly so the outage is visible.
type Env = Partial<Record<'NODE_ENV' | 'VERCEL_ENV' | 'EMAIL_SERVER_PASSWORD' | 'RESEND_API_KEY', string | undefined>>

const PLACEHOLDERS = new Set(['re_placeholder', 'missing-key'])

export function magicLinkDelivery(env: Env): 'send' | 'log' | 'misconfigured' {
  const key = env.EMAIL_SERVER_PASSWORD || env.RESEND_API_KEY
  if (key && !PLACEHOLDERS.has(key)) return 'send'
  return env.VERCEL_ENV || env.NODE_ENV === 'production' ? 'misconfigured' : 'log'
}
