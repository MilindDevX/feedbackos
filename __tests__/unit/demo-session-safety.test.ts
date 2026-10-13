/**
 * UNIT TEST: a Google account can never be attached to the shared demo user, even if a visitor
 * signs in with Google while still holding a demo session; real users still link normally.
 */
// The real adapter is ESM-only; a stand-in that writes through db.account keeps the test about the guard.
jest.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: (db: { account: { create: (args: unknown) => Promise<unknown> } }) => ({
    linkAccount: (account: unknown) => db.account.create({ data: account }),
  }),
}))

import type { PrismaClient } from '@prisma/client'
import type { AdapterAccount } from 'next-auth/adapters'
import { createAuthAdapter } from '@/lib/auth-adapter'
import { DEMO_EMAIL } from '@/lib/demo/constants'

const account = (userId: string) => ({ userId, type: 'oidc', provider: 'google', providerAccountId: 'g-1' }) as AdapterAccount

function fakeDb(email: string) {
  return {
    user: { findUnique: jest.fn().mockResolvedValue({ email }) },
    account: { create: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaClient & { account: { create: jest.Mock } }
}

it('refuses to link any account to the demo user', async () => {
  const db = fakeDb(DEMO_EMAIL)
  await expect(createAuthAdapter(db).linkAccount!(account('demo-user'))).rejects.toThrow('demo user')
  expect(db.account.create).not.toHaveBeenCalled()
})

it('links accounts for everyone else', async () => {
  const db = fakeDb('milind@example.com')
  await createAuthAdapter(db).linkAccount!(account('user-1'))
  expect(db.account.create).toHaveBeenCalled()
})
