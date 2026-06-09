import { Worker, Job } from 'bullmq'
import { createBullMQConnection } from '../lib/redis'
import { QUEUE_NAMES, ClassifyJobPayload, ZendeskSyncPayload, CsvImportPayload } from '../lib/queue'
import { db } from '../lib/db'
import { classifyFeedback, persistClassification, markClassificationError } from '../lib/ai/classify'
import { fetchZendeskTickets, decryptZendeskConfig, mapZendeskTicketToFeedback } from '../lib/integrations/zendesk'
import { getClassifyQueue } from '../lib/queue'
import { validateEnv } from '../lib/env'

// ── AUDIT FIX: Validate all env vars at worker startup ──
validateEnv()

// ── AUDIT FIX: Default concurrency capped at 3 to avoid upstream AI rate limit bursts ──
const CONCURRENCY = Math.min(parseInt(process.env.WORKER_CONCURRENCY || '3', 10), 5)

// ─── Classify Worker ──────────────────────────────────────────────────────────
const classifyWorker = new Worker<ClassifyJobPayload>(
  QUEUE_NAMES.CLASSIFY,
  async (job: Job<ClassifyJobPayload>) => {
    const { feedbackItemId, organizationId } = job.data
    console.log(`[Classify] Processing ${feedbackItemId}`)

    // Mark as classifying
    await db.feedbackItem.update({
      where: { id: feedbackItemId },
      data: { status: 'CLASSIFYING' },
    })

    // Get feedback + org product areas
    const [feedbackItem, productAreas] = await Promise.all([
      db.feedbackItem.findUnique({ where: { id: feedbackItemId } }),
      db.productArea.findMany({
        where: { organizationId, isActive: true },
        select: { name: true },
      }),
    ])

    if (!feedbackItem) {
      throw new Error(`Feedback item ${feedbackItemId} not found`)
    }

    const areaNames = productAreas.map((p) => p.name)
    if (areaNames.length === 0) areaNames.push('Dashboard', 'API', 'Other')

    try {
      const result = await classifyFeedback(feedbackItemId, feedbackItem.rawText, areaNames)
      await persistClassification(feedbackItemId, result)
      console.log(`[Classify] ✓ ${feedbackItemId} → ${result.output.theme} (${result.output.confidence.toFixed(2)}) ${result.latencyMs}ms`)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown classification error'
      // Only mark error on final attempt
      if (job.attemptsMade >= (job.opts?.attempts ?? 3) - 1) {
        await markClassificationError(feedbackItemId, errorMsg)
      }
      throw err // Re-throw so BullMQ handles retry
    }
  },
  {
    connection: createBullMQConnection(),
    concurrency: CONCURRENCY,
  }
)

// ─── Zendesk Sync Worker ──────────────────────────────────────────────────────
const zendeskWorker = new Worker<ZendeskSyncPayload>(
  QUEUE_NAMES.ZENDESK_SYNC,
  async (job: Job<ZendeskSyncPayload>) => {
    const { organizationId, ingestionSourceId } = job.data
    console.log(`[ZendeskSync] Starting for org ${organizationId}`)

    const source = await db.ingestionSource.findUnique({ where: { id: ingestionSourceId } })
    if (!source) throw new Error('Ingestion source not found')

    const config = decryptZendeskConfig(source.configEncrypted)
    const { tickets } = await fetchZendeskTickets(config, { perPage: 100 })

    let ingested = 0
    let skipped = 0
    const classifyQueue = getClassifyQueue()
    const jobsToEnqueue: ClassifyJobPayload[] = []

    for (const ticket of tickets) {
      const mapped = mapZendeskTicketToFeedback(ticket)
      try {
        const item = await db.feedbackItem.create({
          data: {
            organizationId,
            sourceId: ingestionSourceId,
            source: 'ZENDESK',
            rawText: mapped.rawText,
            externalId: mapped.externalId,
            submittedAt: mapped.submittedAt,
            status: 'PENDING',
            metadata: mapped.metadata as Record<string, string>,
          },
        })
        jobsToEnqueue.push({ feedbackItemId: item.id, organizationId })
        ingested++
      } catch (e: unknown) {
        // Unique constraint violation = duplicate
        if (e instanceof Error && e.message.includes('Unique constraint')) {
          skipped++
        } else {
          console.error('[ZendeskSync] Insert error:', e)
        }
      }
    }

    // Bulk enqueue classification jobs
    if (jobsToEnqueue.length > 0) {
      await classifyQueue.addBulk(
        jobsToEnqueue.map((data, i) => ({
          name: `classify-${data.feedbackItemId}`,
          data,
          opts: { priority: 2, jobId: `classify-${data.feedbackItemId}` },
        }))
      )
    }

    // Update last synced
    await db.ingestionSource.update({
      where: { id: ingestionSourceId },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: `success: ${ingested} ingested, ${skipped} skipped`,
      },
    })

    console.log(`[ZendeskSync] ✓ ${ingested} ingested, ${skipped} skipped`)
    return { ingested, skipped }
  },
  { connection: createBullMQConnection(), concurrency: 2 }
)

// ─── CSV Import Worker ─────────────────────────────────────────────────────────
const csvWorker = new Worker<CsvImportPayload>(
  QUEUE_NAMES.CSV_IMPORT,
  async (job: Job<CsvImportPayload>) => {
    const { organizationId, rows } = job.data
    console.log(`[CsvImport] Processing ${rows.length} rows for org ${organizationId}`)

    const classifyQueue = getClassifyQueue()
    const jobsToEnqueue: ClassifyJobPayload[] = []
    let imported = 0

    for (const row of rows) {
      try {
        const item = await db.feedbackItem.create({
          data: {
            organizationId,
            source: 'CSV',
            rawText: row.rawText,
            submittedAt: row.submittedAt ? new Date(row.submittedAt) : new Date(),
            externalId: row.externalId || null,
            submitterEmail: row.submitterEmail || null,
            status: 'PENDING',
          },
        })
        jobsToEnqueue.push({ feedbackItemId: item.id, organizationId })
        imported++
      } catch {
        // Skip duplicates silently
      }
    }

    if (jobsToEnqueue.length > 0) {
      await classifyQueue.addBulk(
        jobsToEnqueue.map((data) => ({
          name: `classify-${data.feedbackItemId}`,
          data,
          opts: { priority: 3, jobId: `classify-${data.feedbackItemId}` },
        }))
      )
    }

    console.log(`[CsvImport] ✓ ${imported}/${rows.length} rows imported`)
    return { imported, total: rows.length }
  },
  { connection: createBullMQConnection(), concurrency: 3 }
)

// ─── Event Listeners ──────────────────────────────────────────────────────────
for (const worker of [classifyWorker, zendeskWorker, csvWorker]) {
  worker.on('failed', (job, err) => {
    console.error(`[Worker:${job?.queueName}] Job ${job?.id} failed:`, err.message)
  })
  worker.on('error', (err) => {
    console.error(`[Worker] Error:`, err.message)
  })
}

console.log(`✅ FeedbackOS Workers running (concurrency: ${CONCURRENCY})`)
console.log(`   Queues: ${Object.values(QUEUE_NAMES).join(', ')}`)

// Graceful shutdown
async function shutdown() {
  console.log('\n🛑 Shutting down workers...')
  await Promise.all([
    classifyWorker.close(),
    zendeskWorker.close(),
    csvWorker.close(),
  ])
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
