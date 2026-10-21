// ABOUTME: Golden-set metrics. A failed prediction counts as wrong (never dropped) so recall is not inflated.
import { EVALUATION_CATEGORIES } from '@/lib/ai/evaluation'
import type { Theme6 } from './golden'
import type { GoldenLabel } from './labels'

export type Prediction = { theme: Theme6; secondary: Theme6[]; sentiment: string; routedToReview: boolean }
export type Pair = { id: string; expected: GoldenLabel; predicted: Prediction | null }
export type ThemeScore = { precision: number; recall: number; f1: number; support: number }

const ratio = (num: number, den: number) => (den === 0 ? 0 : num / den)

export function perThemeScores(pairs: Pair[]): Record<Theme6, ThemeScore> {
  return Object.fromEntries(EVALUATION_CATEGORIES.map((theme) => {
    const support = pairs.filter((p) => p.expected.theme === theme).length
    const predicted = pairs.filter((p) => p.predicted?.theme === theme).length
    const correct = pairs.filter((p) => p.expected.theme === theme && p.predicted?.theme === theme).length
    const precision = ratio(correct, predicted)
    const recall = ratio(correct, support)
    return [theme, { precision, recall, f1: ratio(2 * precision * recall, precision + recall), support }]
  })) as Record<Theme6, ThemeScore>
}

// Standard macro average over the themes present in the labelled data.
export function macroF1(scores: Record<Theme6, ThemeScore>): number {
  const present = Object.values(scores).filter((s) => s.support > 0)
  return ratio(present.reduce((sum, s) => sum + s.f1, 0), present.length)
}

export function confusionMatrix(pairs: Pair[]): Record<Theme6, Record<Theme6 | 'invalid', number>> {
  const columns = [...EVALUATION_CATEGORIES, 'invalid'] as const
  const matrix = Object.fromEntries(EVALUATION_CATEGORIES.map((t) => [t, Object.fromEntries(columns.map((c) => [c, 0]))])) as Record<Theme6, Record<Theme6 | 'invalid', number>>
  for (const p of pairs) matrix[p.expected.theme][p.predicted?.theme ?? 'invalid'] += 1
  return matrix
}

export function sentimentAccuracy(pairs: Pair[]): number {
  return ratio(pairs.filter((p) => p.predicted?.sentiment === p.expected.sentiment).length, pairs.length)
}

// Of the items where a person saw praise next to another theme, how often the model kept that praise.
export function secondaryPraiseRecall(pairs: Pair[]): number {
  const withPraise = pairs.filter((p) => p.expected.secondary.includes('praise'))
  const caught = withPraise.filter((p) => p.predicted && (p.predicted.theme === 'praise' || p.predicted.secondary.includes('praise')))
  return ratio(caught.length, withPraise.length)
}

export function reviewRoutingRate(pairs: Pair[]): number {
  const valid = pairs.filter((p) => p.predicted)
  return ratio(valid.filter((p) => p.predicted!.routedToReview).length, valid.length)
}
