jest.mock('@/lib/dashboard-cache', () => ({ invalidateDashboard: jest.fn(), dashboardCacheKey: jest.fn() }))
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { persistClassificationIfCurrent, recordClassificationFailure } from '@/lib/classification/process'
import type { ClassificationResult } from '@/lib/ai/classify'

const result: ClassificationResult = {
  output: {
    theme: 'bug_problem',
    secondary_themes: [],
    sentiment: 'negative',
    product_area: 'Dashboard',
    confidence: 0.91,
    summary: 'Dashboard freezes when loading feedback',
    requires_human_review: false,
  },
  modelUsed: 'test-model',
  promptTokens: 100,
  completionTokens: 30,
  latencyMs: 20,
  rawResponse: {},
}

const databaseTests = process.env.TEST_DATABASE_URL && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL
  ? describe : describe.skip

databaseTests('guarded classification persistence', () => {
  let organizationId: string
  let feedbackItemId: string

  beforeAll(async () => {
    const organization = await db.organization.create({
      data: { name: 'Process test', slug: `process-test-${randomUUID()}` },
    })
    organizationId = organization.id
    const item = await db.feedbackItem.create({
      data: {
        organizationId,
        source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
        rawText: 'The dashboard freezes when loading more than fifty feedback items.',
        submittedAt: new Date(),
        status: 'CLASSIFYING',
        classificationLeaseToken: 'old-lease',
        classificationLeaseUntil: new Date(Date.now() + 60_000),
      },
    })
    feedbackItemId = item.id
  })

  afterAll(async () => {
    if (organizationId) await db.organization.delete({ where: { id: organizationId } })
    await db.$disconnect()
  })

  it('does not overwrite an item reviewed after the AI call began', async () => {
    await db.feedbackItem.update({ where: { id: feedbackItemId }, data: { status: 'REVIEWED' } })

    const applied = await persistClassificationIfCurrent(feedbackItemId, 'old-lease', result)

    expect(applied).toBe(false)
    expect(await db.classification.findUnique({ where: { feedbackId: feedbackItemId } })).toBeNull()
    expect((await db.feedbackItem.findUnique({ where: { id: feedbackItemId } }))?.status).toBe('REVIEWED')
  })

  it('persists a result only while its lease is current', async () => {
    const current = await db.feedbackItem.create({
      data: {
        organizationId,
        source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
        rawText: 'The dashboard freezes when loading feedback items.',
        submittedAt: new Date(),
        status: 'CLASSIFYING',
        classificationLeaseToken: 'current-lease',
        classificationLeaseUntil: new Date(Date.now() + 60_000),
      },
    })

    const applied = await persistClassificationIfCurrent(current.id, 'current-lease', result)

    expect(applied).toBe(true)
    expect((await db.feedbackItem.findUnique({ where: { id: current.id } }))?.status).toBe('CLASSIFIED')
    expect((await db.classification.findUnique({ where: { feedbackId: current.id } }))?.theme).toBe('BUG_PROBLEM')
  })

  it('returns a failed first attempt to pending with a retry time', async () => {
    const current = await db.feedbackItem.create({
      data: {
        organizationId,
        source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
        rawText: 'The dashboard freezes when loading feedback items.',
        submittedAt: new Date(),
        status: 'CLASSIFYING',
        classificationAttempts: 1,
        classificationLeaseToken: 'failed-lease',
        classificationLeaseUntil: new Date(Date.now() + 60_000),
      },
    })
    const now = new Date()

    const outcome = await recordClassificationFailure(current.id, 'failed-lease', 'temporary model error', now)

    expect(outcome.kind).toBe('retry')
    const updated = await db.feedbackItem.findUniqueOrThrow({ where: { id: current.id } })
    expect(updated.status).toBe('PENDING')
    expect(updated.classificationLeaseToken).toBeNull()
    expect(updated.classificationNextAttemptAt?.getTime()).toBeGreaterThan(now.getTime())
  })
})
