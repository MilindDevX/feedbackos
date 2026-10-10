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
