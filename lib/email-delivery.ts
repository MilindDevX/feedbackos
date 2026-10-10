// ABOUTME: Decides how a sign-in link is delivered. Only local development may print it instead of
// ABOUTME: emailing it; a deployed app without a real key must fail loudly so the outage is visible.
type Env = Partial<Record<'NODE_ENV' | 'VERCEL_ENV' | 'EMAIL_SERVER_PASSWORD' | 'RESEND_API_KEY', string | undefined>>

const PLACEHOLDERS = new Set(['re_placeholder', 'missing-key'])

export function magicLinkDelivery(env: Env): 'send' | 'log' | 'misconfigured' {
  const key = env.EMAIL_SERVER_PASSWORD || env.RESEND_API_KEY
  if (key && !PLACEHOLDERS.has(key)) return 'send'
  return env.VERCEL_ENV || env.NODE_ENV === 'production' ? 'misconfigured' : 'log'
}

// Sending as a domain the SMTP account does not own makes Gmail rewrite the From header (a spoofing
// signal that pushed sign-in mail into spam); default to the authenticated mailbox with a display name.
export function senderAddress(
  env: Partial<Record<'EMAIL_FROM' | 'EMAIL_SERVER_USER' | 'EMAIL_SERVER_HOST', string | undefined>>
): string {
  const user = env.EMAIL_SERVER_USER
  if (env.EMAIL_FROM && user && env.EMAIL_SERVER_HOST?.includes('gmail.com')) {
    // Gmail only sends as the signed-in account (or its verified aliases) and rewrites anything else.
    const match = env.EMAIL_FROM.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
    const address = (match ? match[2] : env.EMAIL_FROM).trim()
    if (address.toLowerCase() !== user.toLowerCase()) return `${match?.[1] || 'FeedbackOS'} <${user}>`
  }
  if (env.EMAIL_FROM) return env.EMAIL_FROM
  if (env.EMAIL_SERVER_USER) return `FeedbackOS <${env.EMAIL_SERVER_USER}>`
  return 'FeedbackOS <noreply@feedbackos.app>'
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// A link-only message reads as phishing to spam filters; say who sent it, why, and when it expires.
export function signInEmail(url: string, host: string): { subject: string; text: string; html: string } {
  const text = [
    'Sign in to FeedbackOS',
    '',
    `Someone (hopefully you) asked to sign in to FeedbackOS at ${host}. Open this link to finish signing in:`,
    '',
    url,
    '',
    'The link works once and expires in 24 hours.',
    "If you didn't ask to sign in, you can safely ignore this email.",
    '',
    '— FeedbackOS',
  ].join('\n')
  const link = escapeHtml(url)
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:20px;font-weight:bold;padding-bottom:12px">Sign in to FeedbackOS</td></tr>
<tr><td style="font-size:15px;line-height:22px;padding-bottom:24px">Someone (hopefully you) asked to sign in to FeedbackOS at ${escapeHtml(host)}. Use the button below to finish signing in.</td></tr>
<tr><td style="padding-bottom:24px"><a href="${link}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px">Sign in to FeedbackOS</a></td></tr>
<tr><td style="font-size:13px;line-height:20px;color:#4b5563;padding-bottom:16px">Or paste this link into your browser:<br><a href="${link}" style="color:#4f46e5;word-break:break-all">${link}</a></td></tr>
<tr><td style="font-size:13px;line-height:20px;color:#4b5563">The link works once and expires in 24 hours. If you didn't ask to sign in, you can safely ignore this email.</td></tr>
</table></td></tr></table></body></html>`
  return { subject: 'Your FeedbackOS sign-in link', text, html }
}
