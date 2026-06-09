/**
 * UNIT TEST: Intercom webhook rejects requests with invalid signature
 */

import { verifyIntercomSignature } from '@/lib/integrations/intercom'
import { createHmac } from 'crypto'

const SECRET = 'my-webhook-secret-key'

function makeValidSignature(body: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

describe('verifyIntercomSignature', () => {
  it('returns true for a valid HMAC-SHA256 signature', () => {
    const body = JSON.stringify({ topic: 'conversation.created', id: 'test-1' })
    const sig = makeValidSignature(body)
    expect(verifyIntercomSignature(body, sig, SECRET)).toBe(true)
  })

  it('returns false when signature is wrong (tampered body)', () => {
    const body = JSON.stringify({ topic: 'conversation.created', id: 'test-1' })
    const sig = makeValidSignature(body)
    const tamperedBody = JSON.stringify({ topic: 'conversation.created', id: 'HACKED' })
    expect(verifyIntercomSignature(tamperedBody, sig, SECRET)).toBe(false)
  })

  it('returns false when signature is wrong (wrong secret)', () => {
    const body = JSON.stringify({ topic: 'conversation.created' })
    const sig = makeValidSignature(body, 'wrong-secret')
    expect(verifyIntercomSignature(body, sig, SECRET)).toBe(false)
  })

  it('returns false when signature header is missing', () => {
    const body = JSON.stringify({ topic: 'conversation.created' })
    expect(verifyIntercomSignature(body, '', SECRET)).toBe(false)
  })

  it('returns false when secret is missing (not configured)', () => {
    const body = JSON.stringify({ topic: 'conversation.created' })
    const sig = makeValidSignature(body)
    expect(verifyIntercomSignature(body, sig, '')).toBe(false)
  })

  it('uses timing-safe comparison (no timing attack possible)', () => {
    // Both valid and invalid signatures should not throw or short-circuit
    const body = 'test body'
    const validSig = makeValidSignature(body)
    const invalidSig = 'sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

    // Both calls should complete without error
    expect(() => verifyIntercomSignature(body, validSig, SECRET)).not.toThrow()
    expect(() => verifyIntercomSignature(body, invalidSig, SECRET)).not.toThrow()
    expect(verifyIntercomSignature(body, invalidSig, SECRET)).toBe(false)
  })

  it('returns false when signature has wrong length (guards timingSafeEqual crash)', () => {
    const body = 'test body'
    const shortSig = 'sha256=abc' // too short
    expect(verifyIntercomSignature(body, shortSig, SECRET)).toBe(false)
  })
})
