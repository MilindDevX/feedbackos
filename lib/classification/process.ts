import { classifyFeedback, type ClassificationResult } from '@/lib/ai/classify'
import { db } from '@/lib/db'
import { secondaryThemeEnums, sentimentToEnum, themeToEnum } from '@/lib/ai/schemas'
import type { Sentiment, Theme } from '@prisma/client'
import { CLASSIFICATION_LEASE_SECONDS, delayProviderUntil, findRecoverableClassifications, refundUnusedReservation, reserveClassification } from './dispatch'
import { publishClassification } from './publish'
import { invalidateDashboard } from '@/lib/dashboard-cache'

export class ClassificationDeferred extends Error {
  constructor(readonly delaySeconds: number) {
    super('Classification is waiting for provider capacity')
    this.name = 'ClassificationDeferred'
  }
}

export function classificationQueueRetry(error: unknown): { afterSeconds: number } | undefined {
  if (error instanceof ClassificationDeferred) return { afterSeconds: Math.min(3600, error.delaySeconds) }
  return undefined
}

// Stop starting new work after this long so one more pacing wait (12 s) plus a model call (30 s timeout)
// still finishes inside the consumer's 120 s maxDuration.
export const DRAIN_BUDGET_MS = 75_000

type ClassifyMessageRef = { feedbackItemId: string; organizationId: string }

interface DrainDeps {
  startedAt: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  findNext?: (now: Date, limit: number) => Promise<ClassifyMessageRef[]>
  process?: (message: ClassifyMessageRef) => Promise<string>
}

// Queue retries for paced items arrive in lockstep about once a minute, so only one item wins each burst.
// The invocation already holding the provider slot keeps taking the oldest due item at the provider pace.
export async function drainDueClassifications({
  startedAt,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  findNext = findRecoverableClassifications,
  process = processClassification,
}: DrainDeps): Promise<void> {
  const skipped = new Set<string>()
  while (now() - startedAt < DRAIN_BUDGET_MS) {
    const [next] = await findNext(new Date(now()), 1)
    if (!next || skipped.has(next.feedbackItemId)) return
    try {
      const outcome = await process(next)
      if (outcome === 'skipped') skipped.add(next.feedbackItemId)
    } catch (error) {
      if (!(error instanceof ClassificationDeferred)) return
      const waitMs = error.delaySeconds * 1000
      if (now() + waitMs - startedAt >= DRAIN_BUDGET_MS) return
      await sleep(waitMs)
    }
  }
}

export async function processClassification(message: {
  feedbackItemId: string
  organizationId: string
}): Promise<'done' | 'skipped' | 'deferred'> {
  const reservation = await reserveClassification(message.feedbackItemId, message.organizationId, new Date())
  if (reservation.kind === 'skip') return 'skipped'
  if (reservation.kind === 'defer') throw new ClassificationDeferred(reservation.delaySeconds)

  // Watchdog: if this invocation dies mid-call, the wakeup finds the expired lease and reclaims the item.
  // Queue redelivery after a crash was not observed in hosted testing; the daily cron stays the last backstop.
  try {
    await publishClassification(message, CLASSIFICATION_LEASE_SECONDS + 30, `watchdog:${reservation.leaseToken}`)
  } catch (error) {
    console.error('[classification] watchdog publish failed', error)
  }

  const item = await db.feedbackItem.findUnique({ where: { id: message.feedbackItemId } })
  if (!item || item.organizationId !== message.organizationId) return 'skipped'
  try {
    const result = await classifyFeedback(item.id, item.rawText, reservation.productAreas, reservation.request)
    try {
      await refundUnusedReservation(reservation.charged, result.promptTokens + result.completionTokens)
    } catch (error) {
      console.error('[classification] reservation refund failed', error)
    }
    const applied = await persistClassificationIfCurrent(item.id, reservation.leaseToken, result)
    if (applied) await invalidateDashboard(item.organizationId)
    return applied ? 'done' : 'skipped'
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Unknown classification error'
    const rateLimitError = error as { status?: number; headers?: { get?: (name: string) => string | null } }
    const retryAfter = rateLimitError.status === 429
      ? Number(rateLimitError.headers?.get?.('retry-after'))
      : NaN
    const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(604_800, Math.ceil(retryAfter))
      : undefined
    const failedAt = new Date()
    if (retryAfterSeconds) {
      await delayProviderUntil(new Date(failedAt.getTime() + retryAfterSeconds * 1000))
    }
    const failure = await recordClassificationFailure(
      item.id,
      reservation.leaseToken,
      messageText,
      failedAt,
      retryAfterSeconds
    )
    if (failure.kind === 'retry') {
      await publishClassification(message, failure.delaySeconds, reservation.leaseToken)
      return 'deferred'
    }
    return 'skipped'
  }
}

export async function persistClassificationIfCurrent(
  feedbackItemId: string,
  leaseToken: string,
  result: ClassificationResult
): Promise<boolean> {
  const { output, modelUsed, promptTokens, completionTokens, latencyMs } = result
  const needsReview = output.requires_human_review || output.confidence < 0.6

  return db.$transaction(async (tx) => {
    const claim = await tx.feedbackItem.updateMany({
      where: {
        id: feedbackItemId,
        status: 'CLASSIFYING',
        classificationLeaseToken: leaseToken,
        classificationLeaseUntil: { gt: new Date() },
      },
      data: {
        status: needsReview ? 'NEEDS_REVIEW' : 'CLASSIFIED',
        classificationLeaseToken: null,
        classificationLeaseUntil: null,
      },
    })
    if (claim.count !== 1) return false

    await tx.classification.upsert({
      where: { feedbackId: feedbackItemId },
      create: {
        feedbackId: feedbackItemId,
        theme: themeToEnum[output.theme] as Theme,
        secondaryThemes: secondaryThemeEnums(output) as Theme[],
        sentiment: sentimentToEnum[output.sentiment] as Sentiment,
        productArea: output.product_area,
        confidenceScore: output.confidence,
        summary: output.summary,
        requiresHumanReview: output.requires_human_review,
        modelUsed,
        promptTokens,
        completionTokens,
        rawLlmResponse: result.rawResponse as object,
      },
      update: {
        theme: themeToEnum[output.theme] as Theme,
        secondaryThemes: secondaryThemeEnums(output) as Theme[],
        sentiment: sentimentToEnum[output.sentiment] as Sentiment,
        productArea: output.product_area,
        confidenceScore: output.confidence,
        summary: output.summary,
        requiresHumanReview: output.requires_human_review,
        modelUsed,
        promptTokens,
        completionTokens,
        rawLlmResponse: result.rawResponse as object,
        classifiedAt: new Date(),
      },
    })
    await tx.classificationLog.upsert({
      where: { feedbackId: feedbackItemId },
      create: { feedbackId: feedbackItemId, modelUsed, promptTokens, completionTokens, latencyMs, success: true },
      update: { modelUsed, promptTokens, completionTokens, latencyMs, success: true, errorMessage: null },
    })
    return true
  })
}

export async function recordClassificationFailure(
  feedbackItemId: string,
  leaseToken: string,
  errorMessage: string,
  now: Date,
  retryAfterSeconds?: number
): Promise<{ kind: 'retry'; delaySeconds: number } | { kind: 'failed' } | { kind: 'stale' }> {
  return db.$transaction(async (tx) => {
    const item = await tx.feedbackItem.findUnique({
      where: { id: feedbackItemId },
      select: { classificationAttempts: true },
    })
    if (!item) return { kind: 'stale' } as const

    const finalAttempt = item.classificationAttempts >= 3
    const delaySeconds = Math.max(1, retryAfterSeconds ?? Math.min(300, 2 ** item.classificationAttempts * 2))
    const claim = await tx.feedbackItem.updateMany({
      where: {
        id: feedbackItemId,
        status: 'CLASSIFYING',
        classificationLeaseToken: leaseToken,
        classificationLeaseUntil: { gt: now },
      },
      data: {
        status: finalAttempt ? 'CLASSIFICATION_ERROR' : 'PENDING',
        classificationLeaseToken: null,
        classificationLeaseUntil: null,
        classificationNextAttemptAt: finalAttempt ? null : new Date(now.getTime() + delaySeconds * 1000),
      },
    })
    if (claim.count !== 1) return { kind: 'stale' } as const

    if (finalAttempt) {
      await tx.classificationLog.upsert({
        where: { feedbackId: feedbackItemId },
        create: {
          feedbackId: feedbackItemId,
          modelUsed: 'openai/gpt-oss-120b',
          promptTokens: 0,
          completionTokens: 0,
          latencyMs: 0,
          success: false,
          errorMessage,
        },
        update: { success: false, errorMessage },
      })
      return { kind: 'failed' } as const
    }
    return { kind: 'retry', delaySeconds } as const
  })
}
