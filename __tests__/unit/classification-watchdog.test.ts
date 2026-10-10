/**
 * UNIT TEST: a claimed classification schedules a delayed watchdog wakeup so a crashed consumer
 * is retried once its lease expires, without relying on Queue redelivery or the daily cron.
 */

jest.mock('@/lib/classification/dispatch', () => ({
  ...jest.requireActual('@/lib/classification/dispatch'),
  reserveClassification: jest.fn(),
  delayProviderUntil: jest.fn(),
}))
jest.mock('@/lib/classification/publish', () => ({ publishClassification: jest.fn() }))
jest.mock('@/lib/ai/classify', () => ({ classifyFeedback: jest.fn() }))
jest.mock('@/lib/db', () => ({
  db: {
    feedbackItem: { findUnique: jest.fn() },
    $transaction: jest.fn().mockResolvedValue(true),
  },
}))

import { reserveClassification, CLASSIFICATION_LEASE_SECONDS } from '@/lib/classification/dispatch'
import { publishClassification } from '@/lib/classification/publish'
import { classifyFeedback } from '@/lib/ai/classify'
import { db } from '@/lib/db'
import { processClassification } from '@/lib/classification/process'

const message = { feedbackItemId: 'item-1', organizationId: 'org-1' }

describe('classification watchdog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(reserveClassification as jest.Mock).mockResolvedValue({
      kind: 'ready', leaseToken: 'lease-1', request: null, productAreas: ['API'],
    })
    ;(db.feedbackItem.findUnique as jest.Mock).mockResolvedValue({
      id: 'item-1', organizationId: 'org-1', rawText: 'Webhooks stopped firing.',
    })
    ;(classifyFeedback as jest.Mock).mockResolvedValue({ output: {} })
  })

  it('queues a wakeup for just after the lease expires before calling the model', async () => {
    const order: string[] = []
    ;(publishClassification as jest.Mock).mockImplementation(async () => { order.push('watchdog'); return 'msg-1' })
    ;(classifyFeedback as jest.Mock).mockImplementation(async () => { order.push('model'); return { output: {} } })

    await processClassification(message)

    expect(publishClassification).toHaveBeenCalledWith(message, CLASSIFICATION_LEASE_SECONDS + 30, 'watchdog:lease-1')
    expect(order).toEqual(['watchdog', 'model'])
  })

  it('still classifies when the watchdog cannot be published', async () => {
    ;(publishClassification as jest.Mock).mockRejectedValue(new Error('queue unavailable'))

    await processClassification(message)

    expect(classifyFeedback).toHaveBeenCalledTimes(1)
  })

  it('does not queue a watchdog when the item was not claimed', async () => {
    ;(reserveClassification as jest.Mock).mockResolvedValue({ kind: 'skip' })

    await expect(processClassification(message)).resolves.toBe('skipped')

    expect(publishClassification).not.toHaveBeenCalled()
  })
})
