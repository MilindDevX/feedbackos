import { Queue } from 'bullmq'
import { createBullMQConnection } from './redis'

// ─── Queue Names ─────────────────────────────────────────────────────────────
export const QUEUE_NAMES = {
  CLASSIFY: 'classify-feedback',
  ZENDESK_SYNC: 'zendesk-sync',
  CSV_IMPORT: 'csv-import',
} as const

// ─── Job Payloads ─────────────────────────────────────────────────────────────
export interface ClassifyJobPayload {
  feedbackItemId: string
  organizationId: string
  retryCount?: number
}

export interface ZendeskSyncPayload {
  organizationId: string
  ingestionSourceId: string
  startTime?: string
}

export interface CsvImportPayload {
  organizationId: string
  rows: Array<{
    rawText: string
    submittedAt?: string
    submitterEmail?: string
    externalId?: string
  }>
}

// ─── Queue Instances ──────────────────────────────────────────────────────────
let classifyQueue: Queue | null = null
let zendeskQueue: Queue | null = null
let csvQueue: Queue | null = null

export function getClassifyQueue(): Queue {
  if (!classifyQueue) {
    classifyQueue = new Queue(QUEUE_NAMES.CLASSIFY, {
      connection: createBullMQConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    })
  }
  return classifyQueue
}

export function getZendeskQueue(): Queue {
  if (!zendeskQueue) {
    zendeskQueue = new Queue(QUEUE_NAMES.ZENDESK_SYNC, {
      connection: createBullMQConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      },
    })
  }
  return zendeskQueue
}

export function getCsvQueue(): Queue {
  if (!csvQueue) {
    csvQueue = new Queue(QUEUE_NAMES.CSV_IMPORT, {
      connection: createBullMQConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 100 },
      },
    })
  }
  return csvQueue
}
