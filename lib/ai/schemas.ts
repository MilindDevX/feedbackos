import { z } from 'zod'

const THEMES = ['bug_problem', 'feature_request', 'usability_issue', 'question_support', 'praise', 'other'] as const

// ─── Classification Output Schema (matches API contract exactly) ──────────────
export const ClassificationOutputSchema = z.object({
  theme: z.enum(THEMES),
  // Older stored responses predate this field.
  secondary_themes: z.array(z.enum(THEMES)).max(2).default([]),
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
        enum: ['bug_problem', 'feature_request', 'usability_issue', 'question_support', 'praise', 'other'],
        description: 'The primary theme category of this feedback',
      },
      secondary_themes: {
        type: 'array',
        items: { type: 'string', enum: ['bug_problem', 'feature_request', 'usability_issue', 'question_support', 'praise', 'other'] },
        description: 'Other themes clearly present besides the primary one, at most 2; empty when there are none',
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
    required: ['theme', 'secondary_themes', 'sentiment', 'product_area', 'confidence', 'summary', 'requires_human_review'],
    additionalProperties: false,
  },
}

// ─── Theme → DB Enum mapping ──────────────────────────────────────────────────
export const themeToEnum: Record<string, string> = {
  bug_problem: 'BUG_PROBLEM',
  feature_request: 'FEATURE_REQUEST',
  usability_issue: 'USABILITY_ISSUE',
  question_support: 'QUESTION_SUPPORT',
  praise: 'PRAISE',
  other: 'OTHER',
}

export const sentimentToEnum: Record<string, string> = {
  positive: 'POSITIVE',
  negative: 'NEGATIVE',
  neutral: 'NEUTRAL',
  mixed: 'MIXED',
}

// Secondary themes as database enums: unique, never repeating the primary theme.
export function secondaryThemeEnums(output: Pick<ClassificationOutput, 'theme' | 'secondary_themes'>): string[] {
  return [...new Set(output.secondary_themes)]
    .filter((theme) => theme !== output.theme)
    .map((theme) => themeToEnum[theme])
}
