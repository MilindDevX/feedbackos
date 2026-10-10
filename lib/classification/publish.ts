import { send } from '@vercel/queue'

export interface ClassifyMessage {
  feedbackItemId: string
  organizationId: string
}

export async function publishClassification(
  message: ClassifyMessage,
  delaySeconds = 0,
  generation: string | number = 0
): Promise<string | null> {
  const { messageId } = await send('feedback-classify', message, {
    delaySeconds: Math.max(0, Math.min(604_800, Math.ceil(delaySeconds))),
    retentionSeconds: 604_800,
    idempotencyKey: `${message.feedbackItemId}:${generation}`,
  })
  return messageId
}
