import { send } from '@vercel/queue'
import { publishClassification } from '@/lib/classification/publish'

jest.mock('@vercel/queue', () => ({ send: jest.fn().mockResolvedValue({ messageId: 'test-message' }) }))

describe('classification queue publishing', () => {
  beforeEach(() => jest.mocked(send).mockClear())

  it('publishes only IDs with a bounded delay and attempt-specific deduplication', async () => {
    await publishClassification({ feedbackItemId: 'item-1', organizationId: 'org-1' }, 20, 1)

    expect(send).toHaveBeenCalledWith(
      'feedback-classify',
      { feedbackItemId: 'item-1', organizationId: 'org-1' },
      expect.objectContaining({ delaySeconds: 20, idempotencyKey: 'item-1:1' })
    )
  })
})
