import { z } from 'zod'

// ─── Classification Output Schema (matches API contract exactly) ──────────────
export const ClassificationOutputSchema = z.object({
  theme: z.enum([
    'bug',
    'feature_request',
    'pricing',
    'onboarding',
    'performance',
    'praise',
    'other',
  ]),
  sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']),
  product_area: z.string().max(100),
  confidence: z.number().min(0).max(1),
  summary: z.string().max(200),
  requires_human_review: z.boolean(),
})

export type ClassificationOutput = z.infer<typeof ClassificationOutputSchema>

// ─── JSON Schema for OpenAI structured outputs ────────────────────────────────
export const classificationJsonSchema = {
  name: 'feedback_classification',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      theme: {
        type: 'string',
        enum: ['bug', 'feature_request', 'pricing', 'onboarding', 'performance', 'praise', 'other'],
        description: 'The primary theme category of this feedback',
      },
      sentiment: {
        type: 'string',
        enum: ['positive', 'negative', 'neutral', 'mixed'],
        description: 'The emotional sentiment of the feedback',
      },
      product_area: {
        type: 'string',
        description: 'The most relevant product area from the provided list',
      },
      confidence: {
        type: 'number',
        description: 'Classification confidence from 0.0 to 1.0',
      },
      summary: {
        type: 'string',
        description: 'One sentence summary of the feedback, maximum 15 words',
      },
      requires_human_review: {
        type: 'boolean',
        description: 'True if this feedback is ambiguous or needs human attention',
      },
    },
    required: ['theme', 'sentiment', 'product_area', 'confidence', 'summary', 'requires_human_review'],
    additionalProperties: false,
  },
}

// ─── Theme → DB Enum mapping ──────────────────────────────────────────────────
export const themeToEnum: Record<string, string> = {
  bug: 'BUG',
  feature_request: 'FEATURE_REQUEST',
  pricing: 'PRICING',
  onboarding: 'ONBOARDING',
  performance: 'PERFORMANCE',
  praise: 'PRAISE',
  other: 'OTHER',
}

export const sentimentToEnum: Record<string, string> = {
  positive: 'POSITIVE',
  negative: 'NEGATIVE',
  neutral: 'NEUTRAL',
  mixed: 'MIXED',
}
