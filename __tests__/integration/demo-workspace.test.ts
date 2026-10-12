/**
 * INTEGRATION TEST: the public demo workspace is seeded once, its visitor can only read, and its sample
 * dates slide forward so the dashboard always shows recent activity.
 */
jest.mock('@/lib/dashboard-cache', () => ({ invalidateDashboard: jest.fn(), dashboardCacheKey: jest.fn() }))

import { db } from '@/lib/db'
import { DEMO_ITEMS } from '@/lib/demo/data'
import { DEMO_SLUG, ensureDemoWorkspace } from '@/lib/demo/workspace'

const databaseTests = process.env.TEST_DATABASE_URL && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL
  ? describe : describe.skip

databaseTests('ensureDemoWorkspace', () => {
  afterAll(async () => {
    await db.organization.deleteMany({ where: { slug: DEMO_SLUG } })
    await db.$disconnect()
  })

  it('seeds the sample data once, even when called concurrently, with a view-only visitor', async () => {
    const [first] = await Promise.all([ensureDemoWorkspace(), ensureDemoWorkspace()])
    await ensureDemoWorkspace()

    expect(await db.feedbackItem.count({ where: { organizationId: first.organizationId } })).toBe(DEMO_ITEMS.length)
    expect(await db.classification.count({ where: { feedbackItem: { organizationId: first.organizationId } } })).toBe(DEMO_ITEMS.length)
    const membership = await db.organizationMember.findFirstOrThrow({ where: { organizationId: first.organizationId, userId: first.userId } })
    expect(membership.role).toBe('VIEWER')
  })

  it('moves stale sample dates forward exactly once, keeping their spacing', async () => {
    const { organizationId } = await ensureDemoWorkspace()
    await db.$executeRaw`UPDATE feedback_items SET "submittedAt" = "submittedAt" - interval '10 days' WHERE "organizationId" = ${organizationId}`
    const before = await db.feedbackItem.findMany({ where: { organizationId }, orderBy: { submittedAt: 'desc' }, take: 2 })

    const now = new Date()
    await Promise.all([ensureDemoWorkspace(now), ensureDemoWorkspace(now)])

    const after = await db.feedbackItem.findMany({ where: { organizationId }, orderBy: { submittedAt: 'desc' }, take: 2 })
    const newestAgeHours = (now.getTime() - after[0].submittedAt.getTime()) / 3_600_000
    expect(newestAgeHours).toBeGreaterThan(2)
    expect(newestAgeHours).toBeLessThan(3)
    expect(after[0].submittedAt.getTime() - after[1].submittedAt.getTime())
      .toBe(before[0].submittedAt.getTime() - before[1].submittedAt.getTime())
  })
})
