import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { prepareClassificationRequest, type PreparedClassificationRequest } from '@/lib/ai/prompts'

// Must exceed the consumer's maxDuration (120 s in vercel.json) so an expired lease means the claimant is dead.
export const CLASSIFICATION_LEASE_SECONDS = 120

export type ClassificationReservation =
  | {
      kind: 'ready'
      leaseToken: string
      request: PreparedClassificationRequest | null
      productAreas: string[]
      // The windows this reservation was charged to, so an unused remainder can be refunded to the same windows.
      charged: { tokens: number; minuteWindowStart: Date; dayWindowStart: Date }
    }
  | { kind: 'defer'; delaySeconds: number }
  | { kind: 'skip' }

export async function delayProviderUntil(until: Date): Promise<void> {
  await db.classificationBudget.updateMany({
    where: { id: 'groq:gpt-oss-120b', nextAllowedAt: { lt: until } },
    data: { nextAllowedAt: until },
  })
}

// Reservations use a byte-count upper bound (~4x typical usage). Refunding the unused part once the provider
// reports actual usage keeps the in-flight bound safe without capping throughput at one request per minute.
export async function refundUnusedReservation(
  charged: { tokens: number; minuteWindowStart: Date; dayWindowStart: Date },
  actualTokens: number
): Promise<void> {
  const refund = charged.tokens - actualTokens
  if (actualTokens <= 0 || refund <= 0) return
  // Matching the charged window means the reservation is still counted there, so the decrement cannot go negative.
  await db.classificationBudget.updateMany({
    where: { id: 'groq:gpt-oss-120b', minuteWindowStart: charged.minuteWindowStart },
    data: { minuteTokens: { decrement: refund } },
  })
  await db.classificationBudget.updateMany({
    where: { id: 'groq:gpt-oss-120b', dayWindowStart: charged.dayWindowStart },
    data: { dayTokens: { decrement: refund } },
  })
}

export async function reserveClassification(
  feedbackItemId: string,
  organizationId: string,
  now: Date
): Promise<ClassificationReservation> {
  const budgetId = 'groq:gpt-oss-120b'
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  await db.classificationBudget.createMany({
    data: [{
      id: budgetId,
      minuteWindowStart: now,
      dayWindowStart: dayStart,
      nextAllowedAt: now,
    }],
    skipDuplicates: true,
  })

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ClassificationBudget" WHERE "id" = ${budgetId} FOR UPDATE`
    const budget = await tx.classificationBudget.findUniqueOrThrow({ where: { id: budgetId } })
    const item = await tx.feedbackItem.findUnique({
      where: { id: feedbackItemId },
      select: {
        organizationId: true,
        status: true,
        source: true,
        rawText: true,
        classificationDispatchKind: true,
        classificationLeaseUntil: true,
        classificationAttempts: true,
        classificationNextAttemptAt: true,
      },
    })
    if (!item || item.organizationId !== organizationId) return { kind: 'skip' } as const
    if (!item.classificationDispatchKind) return { kind: 'skip' } as const
    if (item.status !== 'PENDING' &&
        !(item.status === 'CLASSIFYING' && item.classificationLeaseUntil && item.classificationLeaseUntil <= now)) {
      return { kind: 'skip' } as const
    }
    if (item.classificationAttempts >= 3) {
      const terminal = await tx.feedbackItem.updateMany({
        where: {
          id: feedbackItemId,
          organizationId,
          classificationAttempts: { gte: 3 },
          OR: [
            { status: 'PENDING' },
            { status: 'CLASSIFYING', classificationLeaseUntil: { lte: now } },
          ],
        },
        data: { status: 'CLASSIFICATION_ERROR', classificationLeaseToken: null, classificationLeaseUntil: null },
      })
      if (terminal.count !== 1) return { kind: 'skip' } as const
      await tx.classificationLog.upsert({
        where: { feedbackId: feedbackItemId },
        create: {
          feedbackId: feedbackItemId,
          modelUsed: 'openai/gpt-oss-120b',
          promptTokens: 0,
          completionTokens: 0,
          latencyMs: 0,
          success: false,
          errorMessage: 'Classification timed out after three attempts',
        },
        update: { success: false, errorMessage: 'Classification timed out after three attempts' },
      })
      return { kind: 'skip' } as const
    }
    if (item.classificationNextAttemptAt && item.classificationNextAttemptAt > now) {
      return {
        kind: 'defer',
        delaySeconds: Math.ceil((item.classificationNextAttemptAt.getTime() - now.getTime()) / 1000),
      } as const
    }

    const minuteStart = now.getTime() - budget.minuteWindowStart.getTime() >= 60_000
      ? now : budget.minuteWindowStart
    const minuteRequests = minuteStart === now ? 0 : budget.minuteRequests
    const minuteTokens = minuteStart === now ? 0 : budget.minuteTokens
    const dayRequests = budget.dayWindowStart.getTime() === dayStart.getTime() ? budget.dayRequests : 0
    const dayTokens = budget.dayWindowStart.getTime() === dayStart.getTime() ? budget.dayTokens : 0
    const configuredAreas = await tx.productArea.findMany({ where: { organizationId }, select: { name: true } })
    const productAreas = configuredAreas.length ? configuredAreas.map((area) => area.name) : ['Dashboard', 'API', 'Other']
    const request = prepareClassificationRequest(item.rawText, productAreas)
    const estimatedTokens = request?.reservedTokens ?? 0
    const waitUntil = budget.nextAllowedAt > now ? budget.nextAllowedAt : now
    const dailyLimit = item.classificationDispatchKind === 'BULK' ? 900 : 1000
    if (item.classificationDispatchKind === 'BULK') {
      const interactive = await tx.feedbackItem.findFirst({ where: {
        classificationDispatchKind: 'INTERACTIVE',
        OR: [
          { status: 'PENDING', OR: [
            { classificationNextAttemptAt: null }, { classificationNextAttemptAt: { lte: now } },
          ] },
          { status: 'CLASSIFYING', classificationLeaseUntil: { lte: now } },
        ],
      }, select: { id: true } })
      if (interactive) return { kind: 'defer', delaySeconds: 12 } as const
    }
    const minuteLimitReached = minuteRequests >= 5 || minuteTokens + estimatedTokens > 7000
    const dailyLimitReached = dayRequests >= dailyLimit || dayTokens + estimatedTokens > 200_000
    if (request && (dailyLimitReached || minuteLimitReached || waitUntil > now)) {
      const nextTime = dailyLimitReached
        ? new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
        : minuteLimitReached
          ? new Date(minuteStart.getTime() + 60_000)
          : waitUntil
      return { kind: 'defer', delaySeconds: Math.max(1, Math.ceil((nextTime.getTime() - now.getTime()) / 1000)) } as const
    }

    const leaseToken = randomUUID()
    const claim = await tx.feedbackItem.updateMany({
      where: {
        id: feedbackItemId,
        organizationId,
        AND: [{ OR: [
          { classificationNextAttemptAt: null },
          { classificationNextAttemptAt: { lte: now } },
        ] }],
        OR: [
          { status: 'PENDING' },
          { status: 'CLASSIFYING', classificationLeaseUntil: { lte: now } },
        ],
      },
      data: {
        status: 'CLASSIFYING',
        classificationLeaseToken: leaseToken,
        classificationLeaseUntil: new Date(now.getTime() + CLASSIFICATION_LEASE_SECONDS * 1000),
        classificationAttempts: { increment: 1 },
        classificationNextAttemptAt: null,
      },
    })
    if (claim.count !== 1) return { kind: 'skip' } as const
    if (request) await tx.classificationBudget.update({
      where: { id: budgetId },
      data: {
        minuteWindowStart: minuteStart,
        minuteRequests: minuteRequests + 1,
        minuteTokens: minuteTokens + estimatedTokens,
        dayWindowStart: dayStart,
        dayRequests: dayRequests + 1,
        dayTokens: dayTokens + estimatedTokens,
        nextAllowedAt: new Date(now.getTime() + 12_000),
      },
    })
    return {
      kind: 'ready', leaseToken, request, productAreas,
      charged: { tokens: request ? estimatedTokens : 0, minuteWindowStart: minuteStart, dayWindowStart: dayStart },
    } as const
  })
}
export async function findRecoverableClassifications(now: Date, limit: number): Promise<Array<{
  feedbackItemId: string
  organizationId: string
}>> {
  if (limit <= 0) return []
  const due = {
    OR: [
      { status: 'PENDING' as const, OR: [
        { classificationNextAttemptAt: null },
        { classificationNextAttemptAt: { lte: now } },
      ] },
      { status: 'CLASSIFYING' as const, classificationLeaseUntil: { lte: now } },
    ],
  }
  const manual = await db.feedbackItem.findMany({
    where: { classificationDispatchKind: 'INTERACTIVE', ...due },
    select: { id: true, organizationId: true },
    orderBy: { submittedAt: 'asc' },
    take: limit,
  })
  const csv = manual.length < limit ? await db.feedbackItem.findMany({
    where: { classificationDispatchKind: 'BULK', ...due },
    select: { id: true, organizationId: true },
    orderBy: { submittedAt: 'asc' },
    take: limit - manual.length,
  }) : []
  return [...manual, ...csv].map(({ id, organizationId }) => ({ feedbackItemId: id, organizationId }))
}
