jest.mock('@/lib/dashboard-cache', () => ({ invalidateDashboard: jest.fn(), dashboardCacheKey: jest.fn() }))
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { classifyFeedback } from '@/lib/ai/classify'
import { processClassification } from '@/lib/classification/process'
import { processClassificationMessage } from '@/lib/classification/consumer'
import { publishClassification } from '@/lib/classification/publish'
import { reserveClassification } from '@/lib/classification/dispatch'

jest.mock('@/lib/ai/classify', () => ({ classifyFeedback: jest.fn() }))
jest.mock('@/lib/classification/publish', () => ({ publishClassification: jest.fn().mockResolvedValue('retry-message') }))

const databaseTests = process.env.TEST_DATABASE_URL && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL
  ? describe : describe.skip

databaseTests('serverless classification', () => {
  let organizationId: string

  beforeAll(async () => {
    const organization = await db.organization.create({
      data: { name: 'Consumer test', slug: `consumer-test-${randomUUID()}` },
    })
    organizationId = organization.id
  })

  beforeEach(async () => {
    await db.classificationBudget.deleteMany()
    jest.mocked(publishClassification).mockClear()
    jest.mocked(classifyFeedback).mockResolvedValue({
      output: {
        theme: 'bug_problem', sentiment: 'negative', product_area: 'Dashboard',
        confidence: 0.9, summary: 'Dashboard freezes while loading feedback',
        requires_human_review: false,
      },
      modelUsed: 'test-model', promptTokens: 100, completionTokens: 20,
      latencyMs: 10, rawResponse: {},
    })
  })

  afterAll(async () => {
    if (organizationId) await db.organization.delete({ where: { id: organizationId } })
    await db.$disconnect()
  })

  it('classifies a pending item and persists its result', async () => {
    const item = await db.feedbackItem.create({
      data: {
        organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
        rawText: 'The dashboard freezes when I load many feedback items.',
        submittedAt: new Date(),
      },
    })

    const outcome = await processClassification({ feedbackItemId: item.id, organizationId })

    expect(outcome).toBe('done')
    expect((await db.feedbackItem.findUnique({ where: { id: item.id } }))?.status).toBe('CLASSIFIED')
    expect((await db.classification.findUnique({ where: { feedbackId: item.id } }))?.theme).toBe('BUG_PROBLEM')
  })

  it('refunds the unused part of the token reservation once actual usage is known', async () => {
    const item = await db.feedbackItem.create({ data: {
      organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
      rawText: 'Search results ignore the product area filter.', submittedAt: new Date(),
    } })

    await expect(processClassification({ feedbackItemId: item.id, organizationId })).resolves.toBe('done')

    const budget = await db.classificationBudget.findUniqueOrThrow({ where: { id: 'groq:gpt-oss-120b' } })
    expect(budget.minuteTokens).toBe(120)
    expect(budget.dayTokens).toBe(120)
  })

  it('keeps the full reservation when the provider reports no usage', async () => {
    const item = await db.feedbackItem.create({ data: {
      organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
      rawText: 'Search results ignore the product area filter.', submittedAt: new Date(),
    } })
    jest.mocked(classifyFeedback).mockResolvedValueOnce({
      output: {
        theme: 'bug_problem', sentiment: 'negative', product_area: 'Dashboard',
        confidence: 0.9, summary: 'Search ignores filter', requires_human_review: false,
      },
      modelUsed: 'test-model', promptTokens: 0, completionTokens: 0, latencyMs: 10, rawResponse: {},
    })

    await processClassification({ feedbackItemId: item.id, organizationId })

    const budget = await db.classificationBudget.findUniqueOrThrow({ where: { id: 'groq:gpt-oss-120b' } })
    expect(budget.minuteTokens).toBeGreaterThan(1000)
  })

  it('drains the next due item at the provider pace after finishing its own message', async () => {
    await db.feedbackItem.updateMany({
      where: { status: { in: ['PENDING', 'CLASSIFYING'] } },
      data: { status: 'CLASSIFIED', classificationLeaseToken: null, classificationLeaseUntil: null },
    })
    const first = await db.feedbackItem.create({ data: {
      organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
      rawText: 'Exports time out for workspaces with more than ten thousand rows.', submittedAt: new Date(Date.now() - 2000),
    } })
    const second = await db.feedbackItem.create({ data: {
      organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
      rawText: 'Please let reviewers bulk-approve classifications.', submittedAt: new Date(Date.now() - 1000),
    } })

    await processClassificationMessage({ feedbackItemId: first.id, organizationId })

    for (const id of [first.id, second.id]) {
      expect((await db.feedbackItem.findUniqueOrThrow({ where: { id } })).status).toBe('CLASSIFIED')
    }
  }, 60_000)

  it('recovers a crashed consumer through its watchdog wakeup after the lease expires', async () => {
    const item = await db.feedbackItem.create({
      data: {
        organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
        rawText: 'Webhooks stopped firing about three hours ago and Zapier is broken.',
        submittedAt: new Date(),
      },
    })
    const message = { feedbackItemId: item.id, organizationId }
    // First invocation claims the item, then "dies": the model call never returns.
    jest.mocked(classifyFeedback).mockReturnValueOnce(new Promise(() => {}))
    void processClassification(message)
    await new Promise((resolve) => setTimeout(resolve, 300))

    const claimed = await db.feedbackItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(claimed.status).toBe('CLASSIFYING')
    expect(publishClassification).toHaveBeenCalledWith(message, 150, `watchdog:${claimed.classificationLeaseToken}`)

    // Time passes beyond the lease and the provider pacing slot; the watchdog message is delivered.
    const past = new Date(Date.now() - 151_000)
    await db.feedbackItem.update({ where: { id: item.id }, data: { classificationLeaseUntil: new Date(Date.now() - 1000) } })
    await db.classificationBudget.updateMany({ data: { nextAllowedAt: past, minuteWindowStart: past } })
    const outcome = await processClassification(message)

    expect(outcome).toBe('done')
    const recovered = await db.feedbackItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(recovered.status).toBe('CLASSIFIED')
    expect(recovered.classificationAttempts).toBe(2)
  })

  it('treats a watchdog wakeup for finished work as a no-op', async () => {
    const item = await db.feedbackItem.create({
      data: {
        organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
        rawText: 'Please add a CSV export for the review queue.',
        submittedAt: new Date(),
      },
    })
    const message = { feedbackItemId: item.id, organizationId }
    jest.mocked(classifyFeedback).mockClear()
    await expect(processClassification(message)).resolves.toBe('done')
    await db.classificationBudget.updateMany({ data: { nextAllowedAt: new Date(Date.now() - 1000) } })

    await expect(processClassification(message)).resolves.toBe('skipped')
    expect(classifyFeedback).toHaveBeenCalledTimes(1)
  })

  it('leaves a failed first AI call pending for a bounded retry', async () => {
    const item = await db.feedbackItem.create({
      data: {
        organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
        rawText: 'The dashboard freezes when I load many feedback items.',
        submittedAt: new Date(),
      },
    })
    jest.mocked(classifyFeedback).mockRejectedValueOnce(new Error('temporary provider failure'))

    const outcome = await processClassification({ feedbackItemId: item.id, organizationId })

    expect(outcome).toBe('deferred')
    const updated = await db.feedbackItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(updated.status).toBe('PENDING')
    expect(updated.classificationAttempts).toBe(1)
    expect(updated.classificationNextAttemptAt).not.toBeNull()
    expect(publishClassification).toHaveBeenCalledWith(
      { feedbackItemId: item.id, organizationId },
      expect.any(Number),
      expect.any(String)
    )
  })

  it('asks the queue to retry when the provider pacing slot is occupied', async () => {
    const items = await Promise.all([
      db.feedbackItem.create({ data: { organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE', rawText: 'The dashboard freezes while loading feedback.', submittedAt: new Date() } }),
      db.feedbackItem.create({ data: { organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE', rawText: 'Search does not find older feedback items.', submittedAt: new Date() } }),
    ])
    await reserveClassification(items[0].id, organizationId, new Date())

    await expect(processClassification({ feedbackItemId: items[1].id, organizationId }))
      .rejects.toMatchObject({ delaySeconds: expect.any(Number) })
    expect((await db.feedbackItem.findUnique({ where: { id: items[1].id } }))?.status).toBe('PENDING')
  })

  it('honors a provider Retry-After when scheduling the next AI attempt', async () => {
    const item = await db.feedbackItem.create({
      data: { organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE', rawText: 'Dashboard search stopped finding my saved feedback.', submittedAt: new Date() },
    })
    const throttled = Object.assign(new Error('rate limited'), {
      status: 429,
      headers: new Headers({ 'retry-after': '42' }),
    })
    jest.mocked(classifyFeedback).mockRejectedValueOnce(throttled)

    await processClassification({ feedbackItemId: item.id, organizationId })

    expect(publishClassification).toHaveBeenCalledWith(
      { feedbackItemId: item.id, organizationId }, 42, expect.any(String)
    )
    const another = await db.feedbackItem.create({
      data: { organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE', rawText: 'The search page hangs for several seconds.', submittedAt: new Date() },
    })
    const next = await reserveClassification(another.id, organizationId, new Date())
    expect(next.kind).toBe('defer')
    if (next.kind === 'defer') expect(next.delaySeconds).toBeGreaterThanOrEqual(40)
  })

  it('uses distinct retry keys across two classification runs of the same item', async () => {
    const item = await db.feedbackItem.create({ data: {
      organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
      rawText: 'The dashboard cannot find my saved feedback.', submittedAt: new Date(),
    } })
    jest.mocked(classifyFeedback).mockRejectedValueOnce(new Error('temporary error'))
    await processClassification({ feedbackItemId: item.id, organizationId })
    const firstKey = jest.mocked(publishClassification).mock.calls[0][2]
    await db.feedbackItem.update({ where: { id: item.id }, data: {
      status: 'PENDING', classificationAttempts: 0, classificationNextAttemptAt: null,
    } })
    await db.classificationBudget.deleteMany()
    jest.mocked(classifyFeedback).mockRejectedValueOnce(new Error('temporary error'))
    await processClassification({ feedbackItemId: item.id, organizationId })
    const secondKey = jest.mocked(publishClassification).mock.calls[1][2]
    expect(secondKey).not.toEqual(firstKey)
  })
})
