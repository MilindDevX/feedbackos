import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getClassifyQueue } from '@/lib/queue'
import { verifyIntercomSignature, extractIntercomText, extractIntercomMetadata } from '@/lib/integrations/intercom'
import type { IntercomConversationPayload } from '@/lib/integrations/intercom'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('X-Hub-Signature-256') || ''
  const secret = process.env.INTERCOM_WEBHOOK_SECRET || ''

  // HMAC verification — reject immediately if invalid
  if (secret && !verifyIntercomSignature(rawBody, signature, secret)) {
    console.warn('[Intercom Webhook] Invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: IntercomConversationPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only process conversation topics
  const topic = payload.topic || ''
  if (!topic.startsWith('conversation')) {
    return NextResponse.json({ received: true, processed: false }, { status: 200 })
  }

  const text = extractIntercomText(payload)
  if (!text || text.length < 3) {
    return NextResponse.json({ received: true, processed: false, reason: 'No text content' }, { status: 200 })
  }

  const meta = extractIntercomMetadata(payload)

  // Find the org with an active Intercom integration (match by webhook secret)
  // For multi-tenant: Intercom sends to per-org webhook URLs with unique secrets
  // For simplicity in v1, find the first org with active Intercom source
  const source = await db.ingestionSource.findFirst({
    where: { type: 'INTERCOM', isActive: true },
  })

  if (!source) {
    console.warn('[Intercom Webhook] No active Intercom integration found')
    return NextResponse.json({ received: true, processed: false, reason: 'No integration' }, { status: 200 })
  }

  try {
    const item = await db.feedbackItem.upsert({
      where: {
        organizationId_source_externalId: {
          organizationId: source.organizationId,
          source: 'INTERCOM',
          externalId: meta.externalId,
        },
      },
      create: {
        organizationId: source.organizationId,
        sourceId: source.id,
        source: 'INTERCOM',
        externalId: meta.externalId,
        rawText: text,
        submittedAt: meta.submittedAt,
        submitterEmail: meta.submitterEmail,
        submitterName: meta.submitterName,
        status: 'PENDING',
      },
      update: { rawText: text },
    })

    const queue = getClassifyQueue()
    await queue.add(
      `classify-${item.id}`,
      { feedbackItemId: item.id, organizationId: source.organizationId },
      { priority: 2, jobId: `classify-${item.id}` }
    )

    return NextResponse.json({ received: true, processed: true, feedbackId: item.id }, { status: 200 })
  } catch (err) {
    console.error('[Intercom Webhook] Processing error:', err)
    // Return 200 so Intercom doesn't retry — we'll handle in our error pipeline
    return NextResponse.json({ received: true, processed: false, error: 'Processing failed' }, { status: 200 })
  }
}
