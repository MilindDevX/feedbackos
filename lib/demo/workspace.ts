// ABOUTME: Creates (once) and refreshes the public read-only demo workspace.
// ABOUTME: Visitors join as VIEWER, so every write endpoint refuses them; sample dates slide forward to stay recent.
import { db } from '@/lib/db'
import { invalidateDashboard } from '@/lib/dashboard-cache'
import { DEMO_ITEMS } from './data'

export const DEMO_SLUG = 'demo'
export const DEMO_EMAIL = 'demo@feedbackos.demo'
const DAY_MS = 86_400_000
const REFRESH_AFTER_MS = 6 * 3_600_000
// Arbitrary constant for the Postgres advisory lock that serialises seeding and date refreshes.
const REFRESH_LOCK_KEY = 4_281_337

export async function ensureDemoWorkspace(now = new Date()): Promise<{ userId: string; organizationId: string }> {
  // Prisma upserts are read-then-insert, so two first visitors could both try to create the workspace;
  // the advisory lock makes seeding one-at-a-time.
  const ids = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REFRESH_LOCK_KEY})`
    const user = await tx.user.upsert({
      where: { email: DEMO_EMAIL },
      create: { email: DEMO_EMAIL, name: 'Demo visitor' },
      update: {},
    })
    const organization = await tx.organization.upsert({
      where: { slug: DEMO_SLUG },
      create: { name: 'Acme Analytics (demo)', slug: DEMO_SLUG },
      update: {},
    })
    await tx.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      create: { organizationId: organization.id, userId: user.id, role: 'VIEWER' },
      update: { role: 'VIEWER' },
    })

    // Fixed IDs keep seeding idempotent.
    await tx.feedbackItem.createMany({
      skipDuplicates: true,
      data: DEMO_ITEMS.map((item, index) => ({
        id: `demo-item-${index + 1}`,
        organizationId: organization.id,
        source: item.source,
        rawText: item.text,
        submittedAt: new Date(now.getTime() - item.daysAgo * DAY_MS),
        status: item.status,
        classificationDispatchKind: 'INTERACTIVE' as const,
      })),
    })
    await tx.classification.createMany({
      skipDuplicates: true,
      data: DEMO_ITEMS.map((item, index) => ({
        id: `demo-classification-${index + 1}`,
        feedbackId: `demo-item-${index + 1}`,
        theme: item.theme,
        secondaryThemes: item.secondary ?? [],
        sentiment: item.sentiment,
        productArea: item.area,
        confidenceScore: item.confidence,
        summary: item.summary,
        requiresHumanReview: item.status === 'NEEDS_REVIEW',
        modelUsed: 'openai/gpt-oss-120b',
        promptTokens: 760,
        completionTokens: 110,
        rawLlmResponse: { demo: true },
      })),
    })
    return { userId: user.id, organizationId: organization.id }
  })

  await refreshDemoDates(ids.organizationId, now)
  return ids
}

// Slides every sample date forward so the newest item is recent again; the lock stops two visitors double-shifting.
async function refreshDemoDates(organizationId: string, now: Date): Promise<void> {
  const shifted = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REFRESH_LOCK_KEY})`
    const newest = await tx.feedbackItem.findFirst({ where: { organizationId }, orderBy: { submittedAt: 'desc' }, select: { submittedAt: true } })
    if (!newest || now.getTime() - newest.submittedAt.getTime() < REFRESH_AFTER_MS) return false
    const shiftMs = now.getTime() - newest.submittedAt.getTime() - 0.1 * DAY_MS
    await tx.$executeRaw`UPDATE feedback_items SET "submittedAt" = "submittedAt" + make_interval(secs => ${shiftMs / 1000}) WHERE "organizationId" = ${organizationId}`
    return true
  })
  if (shifted) await invalidateDashboard(organizationId)
}
