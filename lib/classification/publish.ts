import { send } from '@vercel/queue'
import { localTestMode } from '@/lib/local-test-mode'

export interface ClassifyMessage {
  feedbackItemId: string
  organizationId: string
}

// Local test mode has no Vercel Queue, so the dev server delivers messages to the same consumer in-process.
function deliverLocally(message: ClassifyMessage, delaySeconds: number, generation: string | number): string {
  setTimeout(() => {
    import('./consumer')
      .then(({ processClassificationMessage }) => processClassificationMessage(message))
      .catch((error) => console.error('[local queue] classification failed', error))
  }, delaySeconds * 1000)
  return `local:${message.feedbackItemId}:${generation}`
}

export async function publishClassification(
  message: ClassifyMessage,
  delaySeconds = 0,
  generation: string | number = 0
): Promise<string | null> {
  const delay = Math.max(0, Math.min(604_800, Math.ceil(delaySeconds)))
  if (localTestMode()) return deliverLocally(message, delay, generation)
  const { messageId } = await send('feedback-classify', message, {
    delaySeconds: delay,
    retentionSeconds: 604_800,
    idempotencyKey: `${message.feedbackItemId}:${generation}`,
  })
  return messageId
}
