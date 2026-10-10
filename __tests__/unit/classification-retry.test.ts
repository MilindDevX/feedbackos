import { ClassificationDeferred, classificationQueueRetry } from '@/lib/classification/process'

describe('classification queue retry policy', () => {
  it('uses the provider delay for a pacing deferral', () => {
    expect(classificationQueueRetry(new ClassificationDeferred(37)))
      .toEqual({ afterSeconds: 37 })
  })

  it('leaves unexpected errors to the queue default retry policy', () => {
    expect(classificationQueueRetry(new Error('database unavailable'))).toBeUndefined()
  })

  it('rechecks a day-long deferral within the Queue visibility limit', () => {
    expect(classificationQueueRetry(new ClassificationDeferred(86400))).toEqual({ afterSeconds: 3600 })
  })
})
