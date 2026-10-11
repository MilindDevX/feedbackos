/**
 * UNIT TEST: the localhost test sign-in and in-process queue can never switch on in a deployment.
 */
import { isLocalHost, localTestMode } from '@/lib/local-test-mode'

describe('localTestMode', () => {
  it('is on only for an opted-in local development server', () => {
    expect(localTestMode({ LOCAL_TEST_MODE: '1', NODE_ENV: 'development' })).toBe(true)
  })

  it('stays off without the opt-in, in production builds and on any Vercel deployment', () => {
    expect(localTestMode({ NODE_ENV: 'development' })).toBe(false)
    expect(localTestMode({ LOCAL_TEST_MODE: '1', NODE_ENV: 'production' })).toBe(false)
    expect(localTestMode({ LOCAL_TEST_MODE: '1', NODE_ENV: 'development', VERCEL: '1' })).toBe(false)
    expect(localTestMode({ LOCAL_TEST_MODE: '1', NODE_ENV: 'development', VERCEL_ENV: 'preview' })).toBe(false)
  })
})

describe('isLocalHost', () => {
  it('accepts only loopback hosts', () => {
    expect(isLocalHost('localhost:3000')).toBe(true)
    expect(isLocalHost('127.0.0.1:3123')).toBe(true)
    expect(isLocalHost('[::1]:3000')).toBe(true)
    expect(isLocalHost('feedbackos.vercel.app')).toBe(false)
    expect(isLocalHost('localhost.evil.com')).toBe(false)
    expect(isLocalHost(null)).toBe(false)
  })
})
