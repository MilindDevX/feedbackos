import { z } from 'zod'
import type { MessageMetadata } from '@vercel/queue'
import { classificationQueueRetry, drainDueClassifications, processClassification } from './process'

const ClassifyMessageSchema = z.object({
  feedbackItemId: z.string().min(1),
  organizationId: z.string().min(1),
}).strict()

class InvalidClassificationMessage extends Error {
  constructor() { super('Invalid classification message') }
}

export async function processClassificationMessage(message: unknown): Promise<void> {
  const parsed = ClassifyMessageSchema.safeParse(message)
  if (!parsed.success) throw new InvalidClassificationMessage()
  const startedAt = Date.now()
  // A pacing deferral throws before any drain, so only the invocation that held the slot keeps working.
  if (await processClassification(parsed.data) === 'done') await drainDueClassifications({ startedAt })
}

export function classificationMessageRetry(error: unknown, metadata?: Pick<MessageMetadata, 'expiresAt'>): { acknowledge: true } | { afterSeconds: number } | undefined {
  if (error instanceof InvalidClassificationMessage) return { acknowledge: true }
  const retry = classificationQueueRetry(error)
  if (!retry || !metadata) return retry
  const remainingSeconds = Math.floor((metadata.expiresAt.getTime() - Date.now()) / 1000) - 1
  if (remainingSeconds < 1) return { acknowledge: true }
  return { afterSeconds: Math.min(3600, retry.afterSeconds, remainingSeconds) }
}
