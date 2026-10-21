/**
 * UNIT TEST: golden-set metrics, checked against a hand-computed fixture. Failed predictions count as wrong
 * (never dropped), and a theme the model never predicts gets precision 0 rather than NaN.
 */
import type { Theme6 } from '@/lib/eval/golden'
import type { GoldenLabel } from '@/lib/eval/labels'
import {
  confusionMatrix, macroF1, perThemeScores, reviewRoutingRate, secondaryPraiseRecall, sentimentAccuracy, type Pair,
} from '@/lib/eval/metrics'

const expected = (theme: Theme6, sentiment: GoldenLabel['sentiment'], secondary: Theme6[] = []): GoldenLabel =>
  ({ id: 'x', theme, secondary, sentiment, productArea: 'Other', labelledAt: '2026-10-21T00:00:00.000Z' })
const predicted = (theme: Theme6, sentiment: string, secondary: Theme6[] = [], routedToReview = false) =>
  ({ theme, secondary, sentiment, routedToReview })

// expected → predicted
// 1 bug → bug ✓        2 bug → feature ✗      3 feature → feature ✓
// 4 praise → praise ✓ (hidden praise expected on 5,6)
// 5 feature(+praise) → feature(+praise) ✓     6 usability(+praise) → null (provider error)
const pairs: Pair[] = [
  { id: '1', expected: expected('bug_problem', 'negative'), predicted: predicted('bug_problem', 'negative') },
  { id: '2', expected: expected('bug_problem', 'negative'), predicted: predicted('feature_request', 'neutral', [], true) },
  { id: '3', expected: expected('feature_request', 'neutral'), predicted: predicted('feature_request', 'neutral') },
  { id: '4', expected: expected('praise', 'positive'), predicted: predicted('praise', 'positive') },
  { id: '5', expected: expected('feature_request', 'mixed', ['praise']), predicted: predicted('feature_request', 'mixed', ['praise']) },
  { id: '6', expected: expected('usability_issue', 'mixed', ['praise']), predicted: null },
]

test('per-theme precision, recall and F1 match the hand count', () => {
  const s = perThemeScores(pairs)
  expect(s.bug_problem).toEqual({ precision: 1, recall: 0.5, f1: 2 / 3, support: 2 })
  expect(s.feature_request.precision).toBeCloseTo(2 / 3)
  expect(s.feature_request.recall).toBe(1)
  expect(s.feature_request.f1).toBeCloseTo(0.8)
  expect(s.praise).toEqual({ precision: 1, recall: 1, f1: 1, support: 1 })
})

test('a theme never predicted scores precision 0, not NaN, and a failed prediction lowers recall', () => {
  const s = perThemeScores(pairs)
  expect(s.usability_issue).toEqual({ precision: 0, recall: 0, f1: 0, support: 1 })
  expect(s.question_support).toEqual({ precision: 0, recall: 0, f1: 0, support: 0 })
})

test('macro-F1 averages only themes that appear in the expected labels', () => {
  expect(macroF1(perThemeScores(pairs))).toBeCloseTo((2 / 3 + 0.8 + 1 + 0) / 4)
})

test('the confusion matrix records the miss and the failed prediction', () => {
  const m = confusionMatrix(pairs)
  expect(m.bug_problem.feature_request).toBe(1)
  expect(m.bug_problem.bug_problem).toBe(1)
  expect(m.usability_issue.invalid).toBe(1)
})

test('sentiment accuracy counts the failed prediction as wrong', () => {
  expect(sentimentAccuracy(pairs)).toBeCloseTo(4 / 6)
})

test('hidden-praise recall is 1 of 2', () => {
  expect(secondaryPraiseRecall(pairs)).toBe(0.5)
})

test('review routing is 1 of 5 valid predictions', () => {
  expect(reviewRoutingRate(pairs)).toBeCloseTo(1 / 5)
})
