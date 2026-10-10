import { handleCallback } from '@vercel/queue'
import { classificationMessageRetry, processClassificationMessage } from '@/lib/classification/consumer'

export const POST = handleCallback(processClassificationMessage, {
  visibilityTimeoutSeconds: 180,
  retry: classificationMessageRetry,
})
