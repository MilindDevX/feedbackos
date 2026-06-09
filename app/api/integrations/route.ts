import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/encryption'
import { successResponse, unauthorized, serverError, validationError, forbidden } from '@/lib/api-response'
import type { SessionUser } from '@/auth'
import { SourceType } from '@prisma/client'

// ─── GET /api/integrations ────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const user = session.user as SessionUser
  if (!user.organizationId) return forbidden()

  try {
    const sources = await db.ingestionSource.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        displayName: true,
        isActive: true,
        lastSyncedAt: true,
        lastSyncStatus: true,
        createdAt: true,
        updatedAt: true,
        // Deliberately exclude configEncrypted from response
      },
    })
    return successResponse(sources)
  } catch (err) {
    console.error('[GET /api/integrations]', err)
    return serverError()
  }
}

// ─── POST /api/integrations ───────────────────────────────────────────────────
const createIntegrationSchema = z.object({
  type: z.nativeEnum(SourceType),
  displayName: z.string().min(1).max(100),
  config: z.record(z.string()),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const user = session.user as SessionUser
  if (!user.organizationId) return forbidden()
  if (!['OWNER', 'ADMIN'].includes(user.role || '')) {
    return forbidden()
  }

  let body: unknown
  try { body = await req.json() } catch { return validationError('Invalid JSON') }

  const parsed = createIntegrationSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.issues[0].message)

  const { type, displayName, config } = parsed.data

  try {
    const configEncrypted = encrypt(JSON.stringify(config))
    const source = await db.ingestionSource.create({
      data: {
        organizationId: user.organizationId,
        type,
        displayName,
        configEncrypted,
        isActive: true,
      },
      select: {
        id: true, type: true, displayName: true, isActive: true,
        lastSyncedAt: true, lastSyncStatus: true, createdAt: true, updatedAt: true,
      },
    })
    return successResponse(source, undefined, 201)
  } catch (err) {
    console.error('[POST /api/integrations]', err)
    return serverError()
  }
}
