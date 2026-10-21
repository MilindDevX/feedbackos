/**
 * UNIT TEST: running the classifier over the golden set and writing the report. Provider errors become
 * invalid predictions that still count, only labelled items are scored, and every theme appears in the table.
 */
import type { ClassificationOutput } from '@/lib/ai/schemas'
import { assertEvaluationSplitAllowed } from '@/lib/ai/evaluation'
import type { GoldenItem } from '@/lib/eval/golden'
import type { GoldenLabel } from '@/lib/eval/labels'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildReport, evaluateItems, renderMarkdown, reportBasePath, toPrediction } from '@/lib/eval/report'

const output = (overrides: Partial<ClassificationOutput> = {}): ClassificationOutput => ({
  theme: 'bug_problem', secondary_themes: [], sentiment: 'negative', product_area: 'Other',
  confidence: 0.9, summary: 's', requires_human_review: false, ...overrides,
})
const label = (id: string, theme: GoldenLabel['theme']): GoldenLabel =>
  ({ id, theme, secondary: [], sentiment: 'negative', productArea: 'Other', labelledAt: '2026-10-21T00:00:00.000Z' })
const item = (id: string, split: 'dev' | 'test' = 'dev'): GoldenItem => ({ id, text: `text ${id}`, split, hint: 'other' })

test('toPrediction routes low-confidence or flagged results to review', () => {
  expect(toPrediction(output({ confidence: 0.5 })).routedToReview).toBe(true)
  expect(toPrediction(output({ requires_human_review: true })).routedToReview).toBe(true)
  expect(toPrediction(output()).routedToReview).toBe(false)
})

test('evaluateItems scores only labelled items of the split and keeps provider errors as invalid', async () => {
  const items = [item('a'), item('b'), item('c'), item('d', 'test')]
  const labels = new Map([['a', label('a', 'bug_problem')], ['b', label('b', 'praise')], ['d', label('d', 'praise')]])
  const classify = jest.fn(async (id: string) => {
    if (id === 'b') throw new Error('429 rate limit')
    return { output: output(), promptTokens: 100, completionTokens: 20, latencyMs: 50 }
  })

  const run = await evaluateItems(items, labels, 'dev', classify, 0)

  expect(classify).toHaveBeenCalledTimes(2)
  expect(run.skippedUnlabelled).toBe(1)
  expect(run.pairs.map((p) => [p.id, p.predicted?.theme ?? null])).toEqual([['a', 'bug_problem'], ['b', null]])
  expect(run.timings.find((t) => t.id === 'b')?.error).toMatch('429')
})

test('the report counts invalid predictions and renders all six themes', async () => {
  const items = [item('a'), item('b')]
  const labels = new Map([['a', label('a', 'bug_problem')], ['b', label('b', 'praise')]])
  const run = await evaluateItems(items, labels, 'dev', async (id) => {
    if (id === 'b') throw new Error('timeout')
    return { output: output(), promptTokens: 100, completionTokens: 20, latencyMs: 40 }
  }, 0)
  const report = buildReport({ date: '2026-10-21', split: 'dev', model: 'm', promptVersion: 'abc' }, run)

  expect(report.n).toBe(2)
  expect(report.invalid).toBe(1)
  expect(report.perTheme.praise.recall).toBe(0)
  expect(report.tokensPerItem).toBe(120)
  const md = renderMarkdown(report)
  for (const theme of ['Bug / Problem', 'Feature Request', 'Usability Issue', 'Question / Support', 'Praise', 'Other']) {
    expect(md).toContain(theme)
  }
  expect(md).toContain('Invalid outputs: 1')
  // No labelled item had hidden praise, so the rate is not applicable rather than 0%.
  expect(md).toContain('Hidden-praise recall: n/a (no labelled items)')
})

test('the locked test split needs an explicit flag', () => {
  expect(() => assertEvaluationSplitAllowed('test', false)).toThrow('locked')
  expect(() => assertEvaluationSplitAllowed('dev', false)).not.toThrow()
})

test('a second run on the same day gets a new report file instead of overwriting the first', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reports-'))
  const first = reportBasePath(dir, '2026-10-21', 'test')
  expect(first).toBe(join(dir, '2026-10-21-golden-test'))
  writeFileSync(`${first}.json`, '{}')
  const second = reportBasePath(dir, '2026-10-21', 'test')
  expect(second).toBe(join(dir, '2026-10-21-golden-test-2'))
  writeFileSync(`${second}.json`, '{}')
  expect(reportBasePath(dir, '2026-10-21', 'test')).toBe(join(dir, '2026-10-21-golden-test-3'))
})
