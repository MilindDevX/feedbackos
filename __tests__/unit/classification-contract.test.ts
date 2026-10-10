jest.mock('@/lib/db', () => ({
  db: {
    $transaction: jest.fn(),
    classification: { upsert: jest.fn() },
    feedbackItem: { update: jest.fn() },
    classificationLog: { upsert: jest.fn() },
  },
}))

jest.mock('@/lib/ai/client', () => ({
  openai: {
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  },
}))

import { classifyFeedback } from '@/lib/ai/classify'
import { openai } from '@/lib/ai/client'
import { ClassificationOutputSchema, themeToEnum } from '@/lib/ai/schemas'
import { buildSystemPrompt } from '@/lib/ai/prompts'

const createCompletion = openai.chat.completions.create as jest.Mock

describe('classification contract', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns a review fallback when product areas cannot fit the provider budget', async () => {
    const result = await classifyFeedback('feedback-1', 'The dashboard cannot find my saved feedback.', ['x'.repeat(8000)])
    expect(result.output.requires_human_review).toBe(true)
    expect(result.promptTokens).toBe(0)
    expect(createCompletion).not.toHaveBeenCalled()
  })

  it('requires review when the bounded request omits part of the original feedback', async () => {
    createCompletion.mockResolvedValue({
      model: 'test-model', choices: [{ message: { content: JSON.stringify({
        theme: 'bug_problem', sentiment: 'negative', product_area: 'Dashboard', confidence: 0.9,
        summary: 'Search does not find feedback', requires_human_review: false,
      }) } }], usage: { prompt_tokens: 100, completion_tokens: 20 },
    })
    const result = await classifyFeedback('feedback-1', 'Search cannot find feedback. '.repeat(1000), ['Dashboard'])
    expect(result.output.requires_human_review).toBe(true)
  })

  it.each([
    ['bug_problem', 'BUG_PROBLEM'],
    ['feature_request', 'FEATURE_REQUEST'],
    ['usability_issue', 'USABILITY_ISSUE'],
    ['question_support', 'QUESTION_SUPPORT'],
    ['praise', 'PRAISE'],
    ['other', 'OTHER'],
  ])('accepts %s and maps it to %s', (theme, databaseTheme) => {
    const result = ClassificationOutputSchema.parse({
      theme,
      sentiment: 'neutral',
      product_area: 'Dashboard',
      confidence: 0.8,
      summary: 'Concise feedback summary',
      requires_human_review: false,
    })

    expect(result.theme).toBe(theme)
    expect(themeToEnum[theme]).toBe(databaseTheme)
  })

  it.each(['bug', 'pricing', 'onboarding', 'performance'])(
    'rejects retired theme %s',
    (theme) => {
      const result = ClassificationOutputSchema.safeParse({
        theme,
        sentiment: 'neutral',
        product_area: 'Dashboard',
        confidence: 0.8,
        summary: 'Concise feedback summary',
        requires_human_review: false,
      })

      expect(result.success).toBe(false)
    },
  )

  it('propagates rate-limit errors instead of fabricating a classification', async () => {
    const rateLimitError = Object.assign(new Error('429 rate limit exceeded'), {
      status: 429,
    })
    createCompletion.mockRejectedValue(rateLimitError)

    await expect(
      classifyFeedback(
        'feedback-1',
        'The dashboard export fails whenever I select a date range',
        ['Dashboard'],
      ),
    ).rejects.toBe(rateLimitError)
  })

  it('encodes the approved category and review boundaries', () => {
    const prompt = buildSystemPrompt()

    expect(prompt).toContain('Questions about whether a capability exists are question_support')
    expect(prompt).toContain('Explicit requests to add or change behavior are feature_request')
    expect(prompt).toContain('Implicit evidence of satisfaction or realized product value is praise')
    expect(prompt).toContain('Administrative or procurement statements without product feedback are other')
    expect(prompt).toContain('Do not require human review merely because feedback is short')
    expect(prompt).toContain(
      'Require human review for genuinely ambiguous intent or security/privacy-sensitive feedback',
    )
    expect(prompt).toContain(
      'Factual product problems and usability friction are negative even without emotional wording',
    )
    expect(prompt).toContain('Return exactly one product area from the provided list')
    expect(prompt).toContain(
      'Always require human review for actual or potential cross-organization data exposure',
    )
    expect(prompt).toContain('Missing actionable intent or necessary context requires human review')
    expect(prompt).toContain('A required vendor questionnaire is administrative other')
  })

  it('normalizes a generic Other product area to the provided fallback label', async () => {
    createCompletion.mockResolvedValue({
      model: 'test-model',
      choices: [
        {
          message: {
            content: JSON.stringify({
              theme: 'other',
              sentiment: 'neutral',
              product_area: 'Other',
              confidence: 0.8,
              summary: 'Administrative feedback without a product request',
              requires_human_review: false,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 10 },
    })

    const result = await classifyFeedback(
      'feedback-1',
      'Procurement requires a completed vendor questionnaire before contract review.',
      ['AI classification', 'General/other'],
    )

    expect(result.output.product_area).toBe('General/other')
  })
})
