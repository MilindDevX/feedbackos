/**
 * UNIT TEST: sign-in email and database resilience.
 * - On Vercel, a missing or placeholder email key must fail loudly instead of logging magic links.
 * - The database URL gets a connect timeout long enough for a waking Neon branch, unless one is set.
 */
import { magicLinkDelivery } from '@/lib/email-delivery'
import { withConnectTimeout } from '@/lib/db-url'

describe('magicLinkDelivery', () => {
  it('logs the link only in local development without a real key', () => {
    expect(magicLinkDelivery({ NODE_ENV: 'development', EMAIL_SERVER_PASSWORD: undefined })).toBe('log')
    expect(magicLinkDelivery({ NODE_ENV: 'development', EMAIL_SERVER_PASSWORD: 're_placeholder' })).toBe('log')
  })

  it('refuses to fall back on any Vercel deployment', () => {
    expect(magicLinkDelivery({ NODE_ENV: 'production', VERCEL_ENV: 'production', EMAIL_SERVER_PASSWORD: undefined })).toBe('misconfigured')
    expect(magicLinkDelivery({ NODE_ENV: 'production', VERCEL_ENV: 'preview', RESEND_API_KEY: 'missing-key' })).toBe('misconfigured')
  })

  it('sends when a real key is configured', () => {
    expect(magicLinkDelivery({ NODE_ENV: 'production', VERCEL_ENV: 'production', EMAIL_SERVER_PASSWORD: 'abcd efgh ijkl mnop' })).toBe('send')
    expect(magicLinkDelivery({ NODE_ENV: 'development', RESEND_API_KEY: 're_live_key' })).toBe('send')
  })
})

describe('withConnectTimeout', () => {
  it('adds a 30 s connect timeout for waking Neon branches', () => {
    expect(withConnectTimeout('postgresql://u:p@host/db?sslmode=require'))
      .toBe('postgresql://u:p@host/db?sslmode=require&connect_timeout=30')
    expect(withConnectTimeout('postgresql://u:p@host/db')).toBe('postgresql://u:p@host/db?connect_timeout=30')
  })

  it('keeps an explicit timeout and leaves missing or malformed URLs alone', () => {
    expect(withConnectTimeout('postgresql://u:p@host/db?connect_timeout=5')).toBe('postgresql://u:p@host/db?connect_timeout=5')
    expect(withConnectTimeout(undefined)).toBeUndefined()
    expect(withConnectTimeout('not a url')).toBe('not a url')
  })
})

import { signInEmail, senderAddress } from '@/lib/email-delivery'

describe('senderAddress', () => {
  it('sends as the authenticated mailbox with a display name unless a sender is configured', () => {
    expect(senderAddress({ EMAIL_SERVER_USER: 'feedbackos.web@gmail.com' })).toBe('FeedbackOS <feedbackos.web@gmail.com>')
    expect(senderAddress({ EMAIL_FROM: 'FeedbackOS <hello@example.com>', EMAIL_SERVER_USER: 'x@gmail.com' })).toBe('FeedbackOS <hello@example.com>')
    expect(senderAddress({})).toBe('FeedbackOS <noreply@feedbackos.app>')
  })

  it('on Gmail SMTP, never claims an address the account does not own', () => {
    const gmail = { EMAIL_SERVER_HOST: 'smtp.gmail.com', EMAIL_SERVER_USER: 'feedbackos.web@gmail.com' }
    expect(senderAddress({ ...gmail, EMAIL_FROM: 'noreply@feedbackos.app' })).toBe('FeedbackOS <feedbackos.web@gmail.com>')
    expect(senderAddress({ ...gmail, EMAIL_FROM: 'Team <noreply@feedbackos.app>' })).toBe('Team <feedbackos.web@gmail.com>')
    expect(senderAddress({ ...gmail, EMAIL_FROM: 'Support <FeedbackOS.Web@gmail.com>' })).toBe('Support <FeedbackOS.Web@gmail.com>')
  })
})

describe('signInEmail', () => {
  const url = 'https://feedbackos.vercel.app/api/auth/callback/nodemailer?token=abc&email=a%40b.co'
  const email = signInEmail(url, 'feedbackos.vercel.app')

  it('explains who sent it, when it expires and what to do if unexpected', () => {
    expect(email.subject).toBe('Your FeedbackOS sign-in link')
    for (const body of [email.text, email.html]) {
      expect(body).toContain('FeedbackOS')
      expect(body).toContain('24 hours')
      expect(body).toContain('ignore this email')
    }
  })

  it('includes the full link in plain text and as an escaped HTML button', () => {
    expect(email.text).toContain(url)
    expect(email.html).toContain(url.replace(/&/g, '&amp;'))
    expect(email.html).not.toContain('<script')
  })
})
