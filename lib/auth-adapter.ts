// ABOUTME: Auth.js Prisma adapter with one rule added: no account may ever be linked to the shared demo user.
import { PrismaAdapter } from '@auth/prisma-adapter'
import type { Adapter } from 'next-auth/adapters'
import type { PrismaClient } from '@prisma/client'
import { DEMO_EMAIL } from '@/lib/demo/constants'

// Auth.js links a new OAuth account to whoever is signed in. A visitor still holding a demo session
// would otherwise attach their Google identity to the shared demo user and always land in the demo.
export function createAuthAdapter(db: PrismaClient): Adapter {
  const prismaAdapter = PrismaAdapter(db)
  return {
    ...prismaAdapter,
    async linkAccount(account) {
      const owner = await db.user.findUnique({ where: { id: account.userId }, select: { email: true } })
      if (owner?.email === DEMO_EMAIL) throw new Error('Accounts cannot be linked to the demo user')
      await prismaAdapter.linkAccount!(account)
    },
  }
}
