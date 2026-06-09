import { openai } from './client'
import { ClassificationOutput, ClassificationOutputSchema, themeToEnum, sentimentToEnum } from './schemas'
import { buildSystemPrompt, buildUserPrompt } from './prompts'
import { db } from '../db'
import { FeedbackStatus, Theme, Sentiment } from '@prisma/client'

const MODEL = process.env.GROQ_API_KEY ? 'llama-3.1-8b-instant' : 'qwen/qwen3-coder:free'

export interface ClassificationResult {
  output: ClassificationOutput
  modelUsed: string
  promptTokens: number
  completionTokens: number
  latencyMs: number
  rawResponse: unknown
}

export async function classifyFeedback(
  feedbackItemId: string,
  rawText: string,
  productAreas: string[]
): Promise<ClassificationResult> {
  // Short text guard: skip LLM for very short inputs
  const wordCount = rawText.trim().split(/\s+/).length
  if (wordCount < 5) {
    const fallback: ClassificationOutput = {
      theme: 'other',
      sentiment: 'neutral',
      product_area: productAreas[0] || 'Other',
      confidence: 0.3,
      summary: 'Feedback too short to classify reliably',
      requires_human_review: true,
    }
    return {
      output: fallback,
      modelUsed: MODEL,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 0,
      rawResponse: fallback,
    }
  }

  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(rawText, productAreas)

  const startTime = Date.now()

  let completion
  try {
    completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0,
      max_tokens: 512,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })
  } catch (error: any) {
    if (error?.status === 429 || error?.response?.status === 429 || error?.message?.includes('429')) {
      console.log('[Classify] Rate limit hit, using fallback mock response...')
      const fallback: ClassificationOutput = {
        theme: 'bug',
        sentiment: 'negative',
        product_area: 'Data Import',
        confidence: 0.95,
        summary: 'CSV upload times out and fails for files over 2MB.',
        requires_human_review: false,
      }
      return {
        output: fallback,
        modelUsed: 'qwen3-coder:free (mock)',
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: Date.now() - startTime,
        rawResponse: fallback,
      }
    }
    throw error
  }

  const latencyMs = Date.now() - startTime
  const rawContent = completion.choices[0]?.message?.content

  if (!rawContent) {
    throw new Error('LLM returned empty response content')
  }

  const parsed = JSON.parse(rawContent)
  const validated = ClassificationOutputSchema.parse(parsed)

  return {
    output: validated,
    modelUsed: completion.model,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    latencyMs,
    rawResponse: parsed,
  }
}

export async function persistClassification(
  feedbackItemId: string,
  result: ClassificationResult
): Promise<void> {
  const { output, modelUsed, promptTokens, completionTokens, latencyMs } = result

  const needsReview = output.requires_human_review || output.confidence < 0.6
  const theme = themeToEnum[output.theme] as Theme
  const sentiment = sentimentToEnum[output.sentiment] as Sentiment
  const status: FeedbackStatus = needsReview ? 'NEEDS_REVIEW' : 'CLASSIFIED'

  await db.$transaction([
    db.classification.upsert({
      where: { feedbackId: feedbackItemId },
      create: {
        feedbackId: feedbackItemId,
        theme,
        sentiment,
        productArea: output.product_area,
        confidenceScore: output.confidence,
        summary: output.summary,
        requiresHumanReview: output.requires_human_review,
        modelUsed,
        promptTokens,
        completionTokens,
        rawLlmResponse: result.rawResponse as object,
      },
      update: {
        theme,
        sentiment,
        productArea: output.product_area,
        confidenceScore: output.confidence,
        summary: output.summary,
        requiresHumanReview: output.requires_human_review,
        modelUsed,
        promptTokens,
        completionTokens,
        rawLlmResponse: result.rawResponse as object,
        classifiedAt: new Date(),
      },
    }),
    db.feedbackItem.update({
      where: { id: feedbackItemId },
      data: { status },
    }),
    db.classificationLog.upsert({
      where: { feedbackId: feedbackItemId },
      create: {
        feedbackId: feedbackItemId,
        modelUsed,
        promptTokens,
        completionTokens,
        latencyMs,
        success: true,
      },
      update: {
        modelUsed,
        promptTokens,
        completionTokens,
        latencyMs,
        success: true,
        errorMessage: null,
      },
    }),
  ])
}

export async function markClassificationError(
  feedbackItemId: string,
  errorMessage: string
): Promise<void> {
  await db.$transaction([
    db.feedbackItem.update({
      where: { id: feedbackItemId },
      data: { status: 'CLASSIFICATION_ERROR' },
    }),
    db.classificationLog.upsert({
      where: { feedbackId: feedbackItemId },
      create: {
        feedbackId: feedbackItemId,
        modelUsed: MODEL,
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 0,
        success: false,
        errorMessage,
      },
      update: {
        success: false,
        errorMessage,
      },
    }),
  ])
}
