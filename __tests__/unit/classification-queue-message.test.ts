import { processClassification, ClassificationDeferred, drainDueClassifications } from '@/lib/classification/process'
import { classificationMessageRetry, processClassificationMessage } from '@/lib/classification/consumer'

jest.mock('@/lib/classification/process', () => ({
  processClassification: jest.fn(),
  drainDueClassifications: jest.fn(),
  ClassificationDeferred: class ClassificationDeferred extends Error {
    constructor(readonly delaySeconds: number) { super('deferred') }
  },
  classificationQueueRetry: (error: unknown) => error instanceof ClassificationDeferred
    ? { afterSeconds: error.delaySeconds } : undefined,
}))

const process = jest.mocked(processClassification)
const drain = jest.mocked(drainDueClassifications)
beforeEach(() => { process.mockClear(); drain.mockClear() })

it('processes an ID-only queue message', async () => {
  process.mockResolvedValue('done')
  await processClassificationMessage({ feedbackItemId: 'item-1', organizationId: 'org-1' })
  expect(process).toHaveBeenCalledWith({ feedbackItemId: 'item-1', organizationId: 'org-1' })
  expect(drain).toHaveBeenCalledTimes(1)
})

it('does not drain after a skipped message', async () => {
  process.mockResolvedValue('skipped')
  await processClassificationMessage({ feedbackItemId: 'item-1', organizationId: 'org-1' })
  expect(drain).not.toHaveBeenCalled()
})

it('rejects row text and acknowledges malformed messages', async () => {
  let caught: unknown
  try {
    await processClassificationMessage({ feedbackItemId: 'item-1', organizationId: 'org-1', rawText: 'private text' })
  } catch (error) { caught = error }
  expect(caught).toBeInstanceOf(Error)
  expect(process).not.toHaveBeenCalled()
  expect(classificationMessageRetry(caught)).toEqual({ acknowledge: true })
})

it('retries provider deferrals at the requested time', () => {
  expect(classificationMessageRetry(new ClassificationDeferred(42))).toEqual({ afterSeconds: 42 })
})

it('does not reschedule beyond a message expiry', () => {
  const expiresAt = new Date(Date.now() + 60_000)
  const retry = classificationMessageRetry(new ClassificationDeferred(3600), { expiresAt })
  expect(retry).toMatchObject({ afterSeconds: expect.any(Number) })
  if (retry && 'afterSeconds' in retry) expect(retry.afterSeconds).toBeLessThanOrEqual(59)
})

it('acknowledges an expiring wakeup while durable work remains recoverable', () => {
  expect(classificationMessageRetry(new ClassificationDeferred(3600), { expiresAt: new Date(0) }))
    .toEqual({ acknowledge: true })
})
