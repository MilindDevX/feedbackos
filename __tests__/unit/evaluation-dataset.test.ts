import fs from 'node:fs'
import path from 'node:path'
import Papa from 'papaparse'

type EvaluationRow = {
  id: string
  split: 'dev' | 'test'
  locked: boolean
  category: string
  urgency: string
  sentiment: string
  product_area: string
  difficulty: string
  requires_human_review: boolean
  text: string
  anchor_approved: boolean
  review_status: 'approved_anchor' | 'approved_rule' | 'rule_applied' | 'candidate'
  source_type: 'synthetic'
  notes: string
}

const categories = [
  'bug_problem',
  'feature_request',
  'usability_issue',
  'question_support',
  'praise',
  'other',
]

const csv = fs.readFileSync(
  path.join(process.cwd(), 'evaluation/feedbackos-eval-v0.1.csv'),
  'utf8',
)
const parsed = Papa.parse<EvaluationRow>(csv, {
  header: true,
  dynamicTyping: true,
  skipEmptyLines: true,
})

describe('FeedbackOS evaluation dataset', () => {
  it('has the expected schema and no parse errors', () => {
    expect(parsed.errors).toEqual([])
    expect(Object.keys(parsed.data[0])).toEqual([
      'id',
      'split',
      'locked',
      'category',
      'urgency',
      'sentiment',
      'product_area',
      'difficulty',
      'requires_human_review',
      'text',
      'anchor_approved',
      'review_status',
      'source_type',
      'notes',
    ])
  })

  it('contains 192 unique examples', () => {
    expect(parsed.data).toHaveLength(192)
    expect(new Set(parsed.data.map((row) => row.id)).size).toBe(192)
    expect(new Set(parsed.data.map((row) => row.text)).size).toBe(192)
  })

  it.each(categories)('balances %s across dev and locked test splits', (category) => {
    const rows = parsed.data.filter((row) => row.category === category)
    expect(rows).toHaveLength(32)
    expect(rows.filter((row) => row.split === 'dev')).toHaveLength(8)
    expect(rows.filter((row) => row.split === 'test')).toHaveLength(24)
  })

  it('locks only test rows', () => {
    for (const row of parsed.data) {
      expect(row.locked).toBe(row.split === 'test')
    }
  })

  it('uses only allowed labels', () => {
    const allowedUrgencies = new Set(['critical', 'high', 'medium', 'low'])
    const allowedSentiments = new Set(['positive', 'neutral', 'negative', 'mixed'])

    for (const row of parsed.data) {
      expect(categories).toContain(row.category)
      expect(allowedUrgencies.has(row.urgency)).toBe(true)
      expect(allowedSentiments.has(row.sentiment)).toBe(true)
      expect(row.source_type).toBe('synthetic')
    }
  })

  it('distinguishes approved anchors from candidate labels', () => {
    expect(parsed.data.filter((row) => row.review_status === 'approved_anchor')).toHaveLength(8)
    expect(parsed.data.filter((row) => row.review_status === 'approved_rule')).toHaveLength(10)
    expect(parsed.data.filter((row) => row.review_status === 'rule_applied')).toHaveLength(174)
    expect(parsed.data.filter((row) => row.review_status === 'candidate')).toHaveLength(0)

    for (const row of parsed.data) {
      expect(row.anchor_approved).toBe(row.review_status === 'approved_anchor')
    }
  })

  it('encodes the approved capability-question boundary', () => {
    const expectedReview = new Map([
      ['Zendesk sync says complete, but today’s tickets never arrive.', false],
      ['The Slack setup form asks for a webhook URL without telling me where to find it.', false],
      ['Can the dashboard use our financial year instead of the calendar year?', false],
      ['We renewed for another year.', false],
    ])

    for (const [text, requiresReview] of expectedReview) {
      const row = parsed.data.find((candidate) => candidate.text === text)
      expect(row?.review_status).toBe('approved_rule')
      expect(row?.requires_human_review).toBe(requiresReview)
    }
  })

  it('reviews only genuinely ambiguous or sensitive feedback', () => {
    const expectedReview = [
      ['Our dashboard displayed private feedback belonging to another organization.', true],
      ['The customer mentioned Dashboard, Slack, CSV, and billing but did not describe an issue or request.', true],
      ['Please send a Slack alert when critical feedback arrives.', false],
      ['Dark mode would be nice.', false],
      ['Can the dashboard use our financial year instead of the calendar year?', false],
    ] as const

    for (const [text, requiresReview] of expectedReview) {
      const row = parsed.data.find((candidate) => candidate.text === text)
      expect(row?.requires_human_review).toBe(requiresReview)
    }
  })

  it('treats renewal as implicit praise', () => {
    const row = parsed.data.find((candidate) => candidate.text === 'We renewed for another year.')

    expect(row?.category).toBe('praise')
    expect(row?.sentiment).toBe('positive')
    expect(row?.requires_human_review).toBe(false)
  })

  it('treats factual usability friction as negative product sentiment', () => {
    const usabilityRows = parsed.data.filter((row) => row.category === 'usability_issue')

    expect(usabilityRows.every((row) => row.sentiment === 'negative' || row.sentiment === 'mixed')).toBe(true)
  })

  it('phrases feature requests as explicit requests instead of capability questions', () => {
    const row = parsed.data.find(
      (candidate) => candidate.text === 'Please let reviewers save a private draft before submitting a classification change.',
    )

    expect(row?.category).toBe('feature_request')
  })
})
