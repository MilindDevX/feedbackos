/**
 * UNIT TEST: account rules.
 * - A person can own only one workspace (no switcher exists, and each workspace gets its own AI quota share).
 * - Sign-in errors from Auth.js are shown in plain language instead of a silent reload.
 */
jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({ rateLimitBy: jest.fn().mockResolvedValue(null) }))
jest.mock('@/lib/db', () => ({
  db: {
    organizationMember: { findFirst: jest.fn() },
    organization: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}))

import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { POST as createOrganization } from '@/app/api/organizations/route'
import { signInErrorMessage } from '@/lib/auth-errors'

const request = () => new NextRequest('http://localhost/api/organizations', {
  method: 'POST', body: JSON.stringify({ name: 'Second Co', slug: 'second-co' }), headers: { 'Content-Type': 'application/json' },
})

describe('one workspace per person', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(auth as unknown as jest.Mock).mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('refuses a second workspace with a clear 409', async () => {
    jest.mocked(db.organizationMember.findFirst).mockResolvedValueOnce({ id: 'membership-1' } as never)

    const res = await createOrganization(request())

    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('WORKSPACE_EXISTS')
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('lets a person without a workspace create one', async () => {
    jest.mocked(db.organizationMember.findFirst).mockResolvedValueOnce(null as never)
    jest.mocked(db.organization.findUnique).mockResolvedValueOnce(null as never)
    jest.mocked(db.$transaction).mockResolvedValueOnce({ id: 'org-1', slug: 'second-co' } as never)

    expect((await createOrganization(request())).status).toBe(201)
  })
})

describe('signInErrorMessage', () => {
  it('explains expired links and account-linking problems, and stays empty without an error', () => {
    expect(signInErrorMessage('Verification')).toMatch(/expired/)
    expect(signInErrorMessage('OAuthAccountNotLinked')).toMatch(/magic link/)
    expect(signInErrorMessage('SomethingNew')).toMatch(/try again/)
    expect(signInErrorMessage(undefined)).toBe('')
  })
})
