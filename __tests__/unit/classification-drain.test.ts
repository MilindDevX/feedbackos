/**
 * UNIT TEST: after classifying its own item, a consumer keeps draining due work at the provider pace
 * within its time budget, instead of leaving the backlog to lockstep Queue retries (~1 item/minute).
 */
import { ClassificationDeferred, DRAIN_BUDGET_MS, drainDueClassifications } from '@/lib/classification/process'

type Next = { feedbackItemId: string; organizationId: string }

function harness(queue: Next[], outcomes: Record<string, () => Promise<string>> = {}) {
  let clock = 0
  const processed: string[] = []
  const sleeps: number[] = []
  const deps = {
    startedAt: 0,
    now: () => clock,
    sleep: async (ms: number) => { sleeps.push(ms); clock += ms },
    findNext: jest.fn(async () => queue.slice(0, 1)),
    process: jest.fn(async (next: Next) => {
      processed.push(next.feedbackItemId)
      const outcome = outcomes[next.feedbackItemId]
      if (outcome) return outcome()
      queue.shift()
      clock += 3000
      return 'done'
    }),
  }
  return { deps, processed, sleeps, advance: (ms: number) => { clock += ms } }
}

const item = (id: string): Next => ({ feedbackItemId: id, organizationId: 'org-1' })

describe('drainDueClassifications', () => {
  it('classifies queued items one after another, waiting out provider pacing', async () => {
    const queue = [item('a'), item('b')]
    let paced = false
    const { deps, processed, sleeps } = harness(queue, {
      a: async () => {
        if (!paced) { paced = true; throw new ClassificationDeferred(12) }
        queue.shift(); return 'done'
      },
    })

    await drainDueClassifications(deps)

    expect(processed).toEqual(['a', 'a', 'b'])
    expect(sleeps).toEqual([12_000])
  })

  it('stops starting new work once the time budget is spent', async () => {
    const queue = [item('a'), item('b')]
    const h = harness(queue)
    h.advance(DRAIN_BUDGET_MS)

    await drainDueClassifications(h.deps)

    expect(h.processed).toEqual([])
  })

  it('does not sleep past the budget for a long deferral', async () => {
    const queue = [item('a')]
    const { deps, sleeps } = harness(queue, { a: async () => { throw new ClassificationDeferred(3600) } })

    await drainDueClassifications(deps)

    expect(sleeps).toEqual([])
  })

  it('stops instead of spinning when the same item keeps being skipped', async () => {
    const queue = [item('stuck')]
    const { deps } = harness(queue, { stuck: async () => 'skipped' })

    await drainDueClassifications(deps)

    expect(deps.process).toHaveBeenCalledTimes(1)
  })

  it('stops on an unexpected error so the Queue retry policy handles it', async () => {
    const queue = [item('a'), item('b')]
    const { deps, processed } = harness(queue, { a: async () => { throw new Error('database unavailable') } })

    await drainDueClassifications(deps)

    expect(processed).toEqual(['a'])
  })
})
