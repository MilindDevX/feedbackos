import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Verify Intercom webhook HMAC-SHA256 signature
 * Intercom sends: X-Hub-Signature-256 = sha256=<hex>
 */
export function verifyIntercomSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  try {
    return timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected))
  } catch {
    return false
  }
}

export interface IntercomConversationPayload {
  type: string
  id: string
  topic?: string
  data?: {
    item?: {
      id?: string
      source?: {
        body?: string
        author?: {
          email?: string
          name?: string
        }
      }
      conversation_parts?: {
        conversation_parts?: Array<{
          body?: string
          author?: { email?: string; name?: string }
          created_at?: number
        }>
      }
      created_at?: number
    }
  }
}

export function extractIntercomText(payload: IntercomConversationPayload): string | null {
  const item = payload?.data?.item
  if (!item) return null

  // Get initial message
  const sourceBody = item.source?.body || ''
  const cleanSource = sourceBody.replace(/<[^>]*>/g, '').trim()

  // Get conversation parts (replies)
  const parts = item.conversation_parts?.conversation_parts || []
  const partTexts = parts
    .map((p) => (p.body || '').replace(/<[^>]*>/g, '').trim())
    .filter(Boolean)
    .join('\n\n')

  const combined = [cleanSource, partTexts].filter(Boolean).join('\n\n')
  return combined || null
}

export function extractIntercomMetadata(payload: IntercomConversationPayload): {
  externalId: string
  submitterEmail?: string
  submitterName?: string
  submittedAt: Date
} {
  const item = payload?.data?.item
  return {
    externalId: `intercom-${item?.id || payload.id}`,
    submitterEmail: item?.source?.author?.email,
    submitterName: item?.source?.author?.name,
    submittedAt: item?.created_at ? new Date(item.created_at * 1000) : new Date(),
  }
}
