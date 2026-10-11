jest.mock('@/lib/dashboard-cache', () => ({ invalidateDashboard: jest.fn(), dashboardCacheKey: jest.fn() }))
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/auth'
import { PATCH } from '@/app/api/feedback/[id]/route'
import { POST } from '@/app/api/feedback/route'
import { processClassification, persistClassificationIfCurrent } from '@/lib/classification/process'
import { classifyFeedback } from '@/lib/ai/classify'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/classification/publish', () => ({ publishClassification: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({ rateLimit: jest.fn().mockResolvedValue(null), hitRateLimit: jest.fn().mockResolvedValue(false) }))
jest.mock('@/lib/ai/classify', () => ({
  ...jest.requireActual('@/lib/ai/classify'), classifyFeedback: jest.fn(),
}))

const databaseTests = process.env.TEST_DATABASE_URL && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL
  ? describe : describe.skip

databaseTests('review during classification', () => {
  let organizationId: string
  let userId: string
  beforeAll(async () => {
    organizationId = (await db.organization.create({ data: { name: 'Review race', slug: randomUUID() } })).id
    userId = (await db.user.create({ data: { email: `${randomUUID()}@example.test` } })).id
    jest.mocked(auth).mockResolvedValue({ user: { id: userId, organizationId, role: 'ADMIN' } } as never)
  })
  afterAll(async () => {
    if (organizationId) await db.organization.delete({ where: { id: organizationId } })
    if (userId) await db.user.delete({ where: { id: userId } })
    await db.$disconnect()
  })

  it('submits, classifies, reclassifies CSV-origin work using interactive capacity, and reviews', async () => {
    await db.classificationBudget.deleteMany()
    jest.mocked(classifyFeedback).mockResolvedValue({
      output: { theme: 'bug_problem', secondary_themes: [], sentiment: 'negative', product_area: 'API', confidence: 0.9,
        summary: 'Export fails', requires_human_review: false },
      modelUsed: 'test', promptTokens: 100, completionTokens: 20, latencyMs: 1, rawResponse: {},
    })
    const submitted = await POST(new NextRequest('http://localhost/api/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text: 'Export fails whenever I select older feedback.' }),
    }))
    expect(submitted.status).toBe(202)
    const { data: { id } } = await submitted.json()
    expect(await processClassification({ feedbackItemId: id, organizationId })).toBe('done')
    expect(await db.feedbackItem.findUnique({ where: { id } })).toMatchObject({ status: 'CLASSIFIED' })

    // Original ingestion source must not make a human-requested rerun bulk work.
    await db.feedbackItem.update({ where: { id }, data: { source: 'CSV', classificationDispatchKind: 'BULK' } })
    const context = { params: Promise.resolve({ id }) }
    const request = (action: string) => new NextRequest(`http://localhost/api/feedback/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    })
    expect((await PATCH(request('RECLASSIFIED'), context)).status).toBe(200)
    await db.classificationBudget.updateMany({ data: {
      dayRequests: 900, minuteRequests: 0, minuteTokens: 0, nextAllowedAt: new Date(0),
    } })
    expect(await processClassification({ feedbackItemId: id, organizationId })).toBe('done')
    expect((await PATCH(request('ACCEPTED'), context)).status).toBe(200)
    expect(await db.feedbackItem.findUnique({ where: { id } }))
      .toMatchObject({ status: 'REVIEWED', classificationLeaseToken: null, classificationDispatchKind: 'INTERACTIVE' })
    expect(await db.reviewAction.count({ where: { feedbackId: id } })).toBe(2)
  })

  it('preserves a human override when the AI completes between review writes', async () => {
    const item = await db.feedbackItem.create({ data: {
      organizationId, source: 'MANUAL', rawText: 'Please improve export support for feedback.',
      submittedAt: new Date(), status: 'CLASSIFYING', classificationDispatchKind: 'INTERACTIVE',
      classificationLeaseToken: 'review-race', classificationLeaseUntil: new Date(Date.now() + 60_000),
      classification: { create: {
        theme: 'OTHER', sentiment: 'NEUTRAL', productArea: 'API', confidenceScore: 0.5,
        summary: 'Old classification', modelUsed: 'test', promptTokens: 0, completionTokens: 0, rawLlmResponse: {},
      } },
    } })
    let signal!: () => void
    let resume!: () => void
    const intercepted = new Promise<void>((resolve) => { signal = resolve })
    const release = new Promise<void>((resolve) => { resume = resolve })
    const update = db.classification.update.bind(db.classification)
    const spy = jest.spyOn(db.classification, 'update')
    // Intercept the awaited result only; this test does not use Prisma's relation helpers.
    ;(spy as jest.Mock).mockImplementation(async (args: Parameters<typeof update>[0]) => {
      const result = await update(args)
      signal()
      await release
      return result
    })
    try {
      const review = PATCH(new NextRequest(`http://localhost/api/feedback/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'OVERRIDDEN', theme: 'FEATURE_REQUEST', sentiment: 'POSITIVE' }),
      }), { params: Promise.resolve({ id: item.id }) })
      await Promise.race([intercepted, review])
      await persistClassificationIfCurrent(item.id, 'review-race', {
        output: {
          theme: 'bug_problem', secondary_themes: [], sentiment: 'negative', product_area: 'API', confidence: 0.9,
          summary: 'AI classification', requires_human_review: false,
        }, modelUsed: 'test', promptTokens: 100, completionTokens: 20, latencyMs: 1, rawResponse: {},
      })
      resume()
      expect((await review).status).toBe(200)
      expect(await db.classification.findUnique({ where: { feedbackId: item.id } }))
        .toMatchObject({ theme: 'FEATURE_REQUEST', sentiment: 'POSITIVE' })
      expect(await db.feedbackItem.findUnique({ where: { id: item.id } }))
        .toMatchObject({ status: 'REVIEWED', classificationLeaseToken: null })
    } finally { resume(); spy.mockRestore() }
  })
})
