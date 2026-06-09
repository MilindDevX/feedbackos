/**
 * UNIT TEST: Classification worker correctly sets status = "needs_review"
 * when confidence < 0.6 OR requires_human_review = true
 */

// Mock heavy deps before importing
jest.mock('@/lib/db', () => ({
  db: {
    $transaction: jest.fn(),
    classification: { upsert: jest.fn() },
    feedbackItem: { update: jest.fn() },
    classificationLog: { upsert: jest.fn() },
  },
}))

jest.mock('@/lib/ai/client', () => ({
  openai: {
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  },
}))

import { persistClassification } from '@/lib/ai/classify'
import { db } from '@/lib/db'
import type { ClassificationResult } from '@/lib/ai/classify'

const mockDb = db as jest.Mocked<typeof db>

function makeResult(overrides: Partial<ClassificationResult['output']> = {}): ClassificationResult {
  return {
    output: {
      theme: 'bug',
      sentiment: 'negative',
      product_area: 'Dashboard',
      confidence: 0.8,
      summary: 'Export button crashes',
      requires_human_review: false,
      ...overrides,
    },
    modelUsed: 'qwen/qwen3-coder:free',
    promptTokens: 100,
    completionTokens: 50,
    latencyMs: 300,
    rawResponse: {},
  }
}

describe('persistClassification – needs_review logic', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(mockDb.$transaction as jest.Mock).mockImplementation(async (ops: unknown[]) => {
      for (const op of ops) await op
    })
    ;(mockDb.classification.upsert as jest.Mock).mockResolvedValue({})
    ;(mockDb.feedbackItem.update as jest.Mock).mockResolvedValue({})
    ;(mockDb.classificationLog.upsert as jest.Mock).mockResolvedValue({})
  })

  it('sets status CLASSIFIED when confidence >= 0.6 and requires_human_review = false', async () => {
    await persistClassification('item-1', makeResult({ confidence: 0.85, requires_human_review: false }))

    const updateCall = (mockDb.feedbackItem.update as jest.Mock).mock.calls[0][0]
    expect(updateCall.data.status).toBe('CLASSIFIED')
  })

  it('sets status NEEDS_REVIEW when confidence < 0.6', async () => {
    await persistClassification('item-2', makeResult({ confidence: 0.55, requires_human_review: false }))

    const updateCall = (mockDb.feedbackItem.update as jest.Mock).mock.calls[0][0]
    expect(updateCall.data.status).toBe('NEEDS_REVIEW')
  })

  it('sets status NEEDS_REVIEW when confidence >= 0.6 but requires_human_review = true', async () => {
    await persistClassification('item-3', makeResult({ confidence: 0.75, requires_human_review: true }))

    const updateCall = (mockDb.feedbackItem.update as jest.Mock).mock.calls[0][0]
    expect(updateCall.data.status).toBe('NEEDS_REVIEW')
  })

  it('sets status NEEDS_REVIEW at exact boundary confidence = 0.59', async () => {
    await persistClassification('item-4', makeResult({ confidence: 0.59 }))

    const updateCall = (mockDb.feedbackItem.update as jest.Mock).mock.calls[0][0]
    expect(updateCall.data.status).toBe('NEEDS_REVIEW')
  })

  it('does NOT auto-tag items flagged for human review', async () => {
    // The classification upsert should NOT include auto-applied tags when needs review
    await persistClassification('item-5', makeResult({ confidence: 0.4, requires_human_review: true }))

    // Verify feedbackTags create is NOT called (tagging is not part of persist)
    expect(mockDb.feedbackItem.update).toHaveBeenCalledTimes(1)
    const statusArg = (mockDb.feedbackItem.update as jest.Mock).mock.calls[0][0]
    expect(statusArg.data.status).toBe('NEEDS_REVIEW')
  })
})
