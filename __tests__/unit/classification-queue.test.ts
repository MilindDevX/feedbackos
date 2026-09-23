import { getClassifyQueue } from '@/lib/queue'

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((_name, opts) => ({ opts })),
}))

jest.mock('@/lib/redis', () => ({
  createBullMQConnection: jest.fn(() => ({})),
}))

test('classification jobs retry transient failures with bounded backoff', () => {
  expect(getClassifyQueue().opts.defaultJobOptions).toMatchObject({
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  })
})
