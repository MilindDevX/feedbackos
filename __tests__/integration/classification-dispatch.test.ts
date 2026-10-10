import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { findRecoverableClassifications, reserveClassification } from '@/lib/classification/dispatch'

const databaseTests = process.env.TEST_DATABASE_URL && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL
  ? describe : describe.skip

databaseTests('classification reservation', () => {
  const slug = `dispatch-test-${randomUUID()}`
  let organizationId: string
  let feedbackItemId: string

  beforeAll(async () => {
    const organization = await db.organization.create({ data: { name: 'Dispatch test', slug } })
    organizationId = organization.id
    const item = await db.feedbackItem.create({
      data: {
        organizationId,
        source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
        rawText: 'The dashboard becomes slow when I load many feedback items.',
        submittedAt: new Date(),
      },
    })
    feedbackItemId = item.id
  })

  beforeEach(async () => {
    await db.classificationBudget.deleteMany()
  })

  afterAll(async () => {
    if (organizationId) await db.organization.delete({ where: { id: organizationId } })
    await db.$disconnect()
  })

  it('finds due manual work before CSV, including expired leases', async () => {
    const now = new Date('2026-09-23T02:00:00.000Z')
    const csv = await db.feedbackItem.create({ data: {
      organizationId, source: 'CSV', classificationDispatchKind: 'BULK', rawText: 'CSV feedback needing classification', submittedAt: now,
    } })
    const manual = await db.feedbackItem.create({ data: {
      organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE', rawText: 'Manual feedback needing classification', submittedAt: now,
    } })
    const expired = await db.feedbackItem.create({ data: {
      organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE', rawText: 'Expired classification lease', submittedAt: now,
      status: 'CLASSIFYING', classificationLeaseUntil: new Date(now.getTime() - 1000),
    } })
    const future = await db.feedbackItem.create({ data: {
      organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE', rawText: 'Wait for retry', submittedAt: now,
      classificationNextAttemptAt: new Date(now.getTime() + 60_000),
    } })

    const work = await findRecoverableClassifications(now, 10)
    const ids = work.map((item) => item.feedbackItemId)
    expect(ids).toContain(manual.id)
    expect(ids).toContain(expired.id)
    expect(ids).not.toContain(future.id)
    expect(ids.indexOf(csv.id)).toBeGreaterThan(ids.indexOf(manual.id))
  })

  it('reserves long feedback using the prompt truncation limit', async () => {
    const now = new Date('2026-09-23T04:00:00.000Z')
    const item = await db.feedbackItem.create({ data: {
      organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE', rawText: 'a'.repeat(50_000), submittedAt: now,
    } })
    const outcome = await reserveClassification(item.id, organizationId, now)
    expect(outcome.kind).toBe('ready')
  })

  it('charges the complete request reservation to the daily token budget', async () => {
    const now = new Date('2026-10-02T04:00:00.000Z')
    const item = await db.feedbackItem.create({ data: {
      organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
      rawText: 'The dashboard freezes when exporting feedback.', submittedAt: now,
    } })
    const outcome = await reserveClassification(item.id, organizationId, now)
    expect(outcome.kind).toBe('ready')
    if (outcome.kind !== 'ready' || !outcome.request) throw new Error('Expected an AI reservation')
    const budget = await db.classificationBudget.findUniqueOrThrow({ where: { id: 'groq:gpt-oss-120b' } })
    expect(budget).toEqual(expect.objectContaining({ dayTokens: outcome.request.reservedTokens }))
  })

  it('defers without claiming work when its reservation would exceed daily tokens', async () => {
    const now = new Date('2026-10-02T04:00:00.000Z')
    await db.classificationBudget.create({ data: {
      id: 'groq:gpt-oss-120b', minuteWindowStart: now,
      dayWindowStart: new Date('2026-10-02T00:00:00.000Z'), dayTokens: 199_999,
      nextAllowedAt: new Date(0),
    } })
    const item = await db.feedbackItem.create({ data: {
      organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
      rawText: 'The dashboard freezes when exporting feedback.', submittedAt: now,
    } })
    expect(await reserveClassification(item.id, organizationId, now)).toEqual({ kind: 'defer', delaySeconds: 72_000 })
    expect(await db.feedbackItem.findUnique({ where: { id: item.id } })).toEqual(expect.objectContaining({
      status: 'PENDING', classificationAttempts: 0, classificationLeaseToken: null,
    }))
    expect(await db.classificationBudget.findUnique({ where: { id: 'groq:gpt-oss-120b' } })).toEqual(expect.objectContaining({
      dayTokens: 199_999, dayRequests: 0,
    }))
  })

  it('resets daily token reservations at the next UTC day', async () => {
    const now = new Date('2026-10-03T00:00:00.000Z')
    await db.classificationBudget.create({ data: {
      id: 'groq:gpt-oss-120b', minuteWindowStart: new Date('2026-10-02T00:00:00.000Z'),
      dayWindowStart: new Date('2026-10-02T00:00:00.000Z'), dayTokens: 200_000,
      nextAllowedAt: new Date(0),
    } })
    const item = await db.feedbackItem.create({ data: {
      organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
      rawText: 'The dashboard freezes when exporting feedback.', submittedAt: now,
    } })
    const outcome = await reserveClassification(item.id, organizationId, now)
    expect(outcome.kind).toBe('ready')
    if (outcome.kind !== 'ready' || !outcome.request) throw new Error('Expected an AI reservation')
    expect(await db.classificationBudget.findUnique({ where: { id: 'groq:gpt-oss-120b' } })).toEqual(expect.objectContaining({
      dayTokens: outcome.request.reservedTokens, dayRequests: 1,
    }))
  })

  it('initializes one provider budget safely under concurrent cold starts', async () => {
    const now = new Date('2026-10-01T00:00:00.000Z')
    const items = await Promise.all(Array.from({ length: 12 }, () => db.feedbackItem.create({ data: {
      organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE', rawText: 'The dashboard freezes when loading feedback.', submittedAt: now,
    } })))
    const outcomes = await Promise.allSettled(items.map((item) => reserveClassification(item.id, organizationId, now)))
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toEqual([])
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled' && outcome.value.kind === 'ready')).toHaveLength(1)
  })

  it('defers a CSV delivery while due interactive feedback is waiting', async () => {
    const now = new Date('2026-10-01T01:00:00.000Z')
    const csv = await db.feedbackItem.create({ data: {
      organizationId, source: 'CSV', classificationDispatchKind: 'BULK', rawText: 'Bulk export cannot find older feedback.', submittedAt: now,
    } })
    await db.feedbackItem.create({ data: {
      organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE', rawText: 'The dashboard hangs when searching feedback.', submittedAt: now,
    } })
    expect((await reserveClassification(csv.id, organizationId, now)).kind).toBe('defer')
  })

  it('recovers API submissions and reclassified integration-origin feedback', async () => {
    const now = new Date('2026-10-01T02:00:00.000Z')
    const items = await Promise.all(['API', 'ZENDESK'].map((source) => db.feedbackItem.create({ data: {
      organizationId, source: source as 'API' | 'ZENDESK', classificationDispatchKind: 'INTERACTIVE', rawText: 'The dashboard cannot find feedback.', submittedAt: now,
    } })))
    const recovered = await findRecoverableClassifications(now, 100)
    expect(recovered.map((item) => item.feedbackItemId)).toEqual(expect.arrayContaining(items.map((item) => item.id)))
  })

  it('stops retrying after three expired leases', async () => {
    const now = new Date('2026-09-23T05:00:00.000Z')
    const item = await db.feedbackItem.create({ data: {
      organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE', rawText: 'Provider timed out repeatedly', submittedAt: now,
      status: 'CLASSIFYING', classificationAttempts: 3,
      classificationLeaseUntil: new Date(now.getTime() - 1000),
    } })

    expect(await reserveClassification(item.id, organizationId, now)).toEqual({ kind: 'skip' })
    expect((await db.feedbackItem.findUnique({ where: { id: item.id } }))?.status).toBe('CLASSIFICATION_ERROR')
  })

  it('allows only one concurrent claim of a pending item', async () => {
    const now = new Date('2026-09-23T00:00:00.000Z')
    const outcomes = await Promise.all([
      reserveClassification(feedbackItemId, organizationId, now),
      reserveClassification(feedbackItemId, organizationId, now),
    ])

    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(['ready', 'skip'])
  })

  it('reclaims a classifying item after its lease expires', async () => {
    const later = new Date('2026-09-23T00:03:00.000Z')
    const outcome = await reserveClassification(feedbackItemId, organizationId, later)

    expect(outcome.kind).toBe('ready')
  })

  it('defers a second item when the provider pacing slot is occupied', async () => {
    const items = await Promise.all([
      db.feedbackItem.create({ data: { organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE', rawText: 'The export button fails when I select this dashboard.', submittedAt: new Date() } }),
      db.feedbackItem.create({ data: { organizationId, source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE', rawText: 'Please add a filter for urgent feedback on the dashboard.', submittedAt: new Date() } }),
    ])
    const now = new Date('2026-09-23T00:10:00.000Z')

    const first = await reserveClassification(items[0].id, organizationId, now)
    const second = await reserveClassification(items[1].id, organizationId, now)

    expect(first.kind).toBe('ready')
    expect(second.kind).toBe('defer')
    if (second.kind === 'defer') expect(second.delaySeconds).toBeGreaterThan(0)
  })

  it('does not reclaim a retry before its scheduled time', async () => {
    const now = new Date('2026-09-23T00:20:00.000Z')
    const eligibleAt = new Date('2026-09-23T00:25:00.000Z')
    const item = await db.feedbackItem.create({
      data: {
        organizationId,
        source: 'MANUAL', classificationDispatchKind: 'INTERACTIVE',
        rawText: 'The search query fails when I type a question mark.',
        submittedAt: now,
        classificationNextAttemptAt: eligibleAt,
      },
    })

    const outcome = await reserveClassification(item.id, organizationId, now)

    expect(outcome).toEqual({ kind: 'defer', delaySeconds: 300 })
    expect((await db.feedbackItem.findUnique({ where: { id: item.id } }))?.status).toBe('PENDING')
  })
})
