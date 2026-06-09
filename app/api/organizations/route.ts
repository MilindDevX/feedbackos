import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { successResponse, unauthorized, serverError, validationError, forbidden } from '@/lib/api-response'
import type { SessionUser } from '@/auth'

// ─── POST /api/organizations — Create new org ─────────────────────────────────
const createOrgSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()

  let body: unknown
  try { body = await req.json() } catch { return validationError('Invalid JSON') }

  const parsed = createOrgSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error.issues[0].message)

  const { name, slug } = parsed.data

  try {
    // Check slug uniqueness
    const existing = await db.organization.findUnique({ where: { slug } })
    if (existing) return validationError('This organization slug is already taken')

    const org = await db.$transaction(async (tx) => {
      const newOrg = await tx.organization.create({ data: { name, slug } })

      // Add creator as owner
      await tx.organizationMember.create({
        data: {
          organizationId: newOrg.id,
          userId: session.user!.id!,
          role: 'OWNER',
        },
      })

      // Seed default product areas
      const defaultAreas = ['Dashboard', 'Authentication', 'API', 'Billing', 'Onboarding', 'Integrations', 'Other']
      await tx.productArea.createMany({
        data: defaultAreas.map((name) => ({
          organizationId: newOrg.id,
          name,
          slug: name.toLowerCase(),
        })),
      })

      return newOrg
    })

    return successResponse({ organization: org }, undefined, 201)
  } catch (err) {
    console.error('[POST /api/organizations]', err)
    return serverError()
  }
}
