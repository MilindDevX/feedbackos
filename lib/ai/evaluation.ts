export const EVALUATION_CATEGORIES = [
  'bug_problem',
  'feature_request',
  'usability_issue',
  'question_support',
  'praise',
  'other',
] as const

export type EvaluationLabels = {
  category: string
  sentiment: string
  productArea: string
  requiresHumanReview: boolean
  urgency?: string
}

export type EvaluationRecord = {
  id: string
  expected: EvaluationLabels
  predicted: EvaluationLabels | null
  latencyMs: number
  promptTokens: number
  completionTokens: number
  error?: string
}

export type EvaluationMetrics = {
  total: number
  valid: number
  categoryMacroF1: number
  sentimentAccuracy: number
  productAreaAccuracy: number
  reviewAccuracy: number
  fullExactMatch: number
  invalidOutputRate: number
  urgencyAccuracy: number | null
  averageLatencyMs: number
  promptTokens: number
  completionTokens: number
}

export function assertEvaluationSplitAllowed(split: string, allowLockedTest: boolean): void {
  if (split === 'test' && !allowLockedTest) {
    throw new Error('The test split is locked. Pass --allow-locked-test only after approval.')
  }

  if (split !== 'dev' && split !== 'test') {
    throw new Error(`Unsupported evaluation split: ${split}`)
  }
}

function accuracy(
  records: EvaluationRecord[],
  matches: (expected: EvaluationLabels, predicted: EvaluationLabels) => boolean,
): number {
  if (records.length === 0) return 0
  return records.filter((record) => record.predicted && matches(record.expected, record.predicted)).length / records.length
}

export function computeEvaluationMetrics(records: EvaluationRecord[]): EvaluationMetrics {
  const total = records.length
  const valid = records.filter((record) => record.predicted !== null).length

  const categoryF1 = EVALUATION_CATEGORIES.map((category) => {
    const truePositive = records.filter(
      (record) => record.expected.category === category && record.predicted?.category === category,
    ).length
    const falsePositive = records.filter(
      (record) => record.expected.category !== category && record.predicted?.category === category,
    ).length
    const falseNegative = records.filter(
      (record) => record.expected.category === category && record.predicted?.category !== category,
    ).length
    const precision = truePositive + falsePositive === 0 ? 0 : truePositive / (truePositive + falsePositive)
    const recall = truePositive + falseNegative === 0 ? 0 : truePositive / (truePositive + falseNegative)
    return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  })

  const hasUrgencyPredictions = records.some((record) => record.predicted?.urgency !== undefined)
  const urgencyAccuracy = hasUrgencyPredictions
    ? accuracy(records, (expected, predicted) => expected.urgency === predicted.urgency)
    : null

  return {
    total,
    valid,
    categoryMacroF1: categoryF1.reduce((sum, score) => sum + score, 0) / categoryF1.length,
    sentimentAccuracy: accuracy(records, (expected, predicted) => expected.sentiment === predicted.sentiment),
    productAreaAccuracy: accuracy(records, (expected, predicted) => expected.productArea === predicted.productArea),
    reviewAccuracy: accuracy(
      records,
      (expected, predicted) => expected.requiresHumanReview === predicted.requiresHumanReview,
    ),
    fullExactMatch: accuracy(
      records,
      (expected, predicted) =>
        expected.category === predicted.category &&
        expected.sentiment === predicted.sentiment &&
        expected.productArea === predicted.productArea &&
        expected.requiresHumanReview === predicted.requiresHumanReview &&
        (predicted.urgency === undefined || expected.urgency === predicted.urgency),
    ),
    invalidOutputRate: total === 0 ? 0 : (total - valid) / total,
    urgencyAccuracy,
    averageLatencyMs: total === 0 ? 0 : records.reduce((sum, record) => sum + record.latencyMs, 0) / total,
    promptTokens: records.reduce((sum, record) => sum + record.promptTokens, 0),
    completionTokens: records.reduce((sum, record) => sum + record.completionTokens, 0),
  }
}
