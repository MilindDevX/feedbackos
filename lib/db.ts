import { PrismaClient } from '@prisma/client'
import { withConnectTimeout } from './db-url'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // A Neon branch waking from archive can take longer than Prisma's default connect timeout.
    ...(process.env.DATABASE_URL ? { datasources: { db: { url: withConnectTimeout(process.env.DATABASE_URL) } } } : {}),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
