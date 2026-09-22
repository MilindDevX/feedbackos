import {
  assertEvaluationSplitAllowed,
  computeEvaluationMetrics,
  type EvaluationRecord,
} from '@/lib/ai/evaluation'

const exactRecords: EvaluationRecord[] = [
  ['bug_problem', 'negative', 'Dashboard', false],
  ['feature_request', 'neutral', 'Review queue', false],
  ['usability_issue', 'negative', 'Search/filtering', false],
  ['question_support', 'neutral', 'Team/organization access', true],
  ['praise', 'positive', 'Dashboard/analytics', false],
  ['other', 'neutral', 'General/other', true],
].map(([category, sentiment, productArea, requiresHumanReview], index) => ({
  id: `row-${index + 1}`,
  expected: {
    category: category as string,
    sentiment: sentiment as string,
    productArea: productArea as string,
    requiresHumanReview: requiresHumanReview as boolean,
  },
  predicted: {
    category: category as string,
    sentiment: sentiment as string,
    productArea: productArea as string,
    requiresHumanReview: requiresHumanReview as boolean,
  },
  latencyMs: 100,
  promptTokens: 20,
  completionTokens: 10,
}))

describe('evaluation metrics', () => {
  it('reports perfect scores for exact predictions', () => {
    expect(computeEvaluationMetrics(exactRecords)).toMatchObject({
      total: 6,
      valid: 6,
      categoryMacroF1: 1,
      sentimentAccuracy: 1,
      productAreaAccuracy: 1,
      reviewAccuracy: 1,
      fullExactMatch: 1,
      invalidOutputRate: 0,
      urgencyAccuracy: null,
      averageLatencyMs: 100,
      promptTokens: 120,
      completionTokens: 60,
    })
  })

  it('counts invalid output without treating it as an exact match', () => {
    const records = exactRecords.map((record) => ({ ...record }))
    records[0] = { ...records[0], predicted: null, error: 'invalid JSON' }

    const metrics = computeEvaluationMetrics(records)

    expect(metrics.total).toBe(6)
    expect(metrics.valid).toBe(5)
    expect(metrics.invalidOutputRate).toBeCloseTo(1 / 6)
    expect(metrics.fullExactMatch).toBeCloseTo(5 / 6)
    expect(metrics.categoryMacroF1).toBeCloseTo(5 / 6)
  })

  it('computes urgency accuracy only when predictions contain urgency', () => {
    const records = exactRecords.map((record, index) => ({
      ...record,
      expected: { ...record.expected, urgency: index === 0 ? 'high' : 'low' },
      predicted: { ...record.predicted!, urgency: index < 2 ? 'high' : 'low' },
    }))

    expect(computeEvaluationMetrics(records).urgencyAccuracy).toBeCloseTo(5 / 6)
  })
})

describe('evaluation split guard', () => {
  it('allows the development split by default', () => {
    expect(() => assertEvaluationSplitAllowed('dev', false)).not.toThrow()
  })

  it('rejects the locked test split without an explicit unlock', () => {
    expect(() => assertEvaluationSplitAllowed('test', false)).toThrow(
      'The test split is locked. Pass --allow-locked-test only after approval.',
    )
  })

  it('allows the test split after an explicit unlock', () => {
    expect(() => assertEvaluationSplitAllowed('test', true)).not.toThrow()
  })
})
