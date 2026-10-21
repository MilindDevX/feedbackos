// ABOUTME: Runs the classifier over labelled golden items and turns the results into a dated, readable report.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { EVALUATION_CATEGORIES } from '@/lib/ai/evaluation'
import type { ClassificationOutput } from '@/lib/ai/schemas'
import { formatTheme } from '@/lib/utils'
import type { GoldenItem, Theme6 } from './golden'
import type { GoldenLabel } from './labels'
import {
  confusionMatrix, macroF1, perThemeScores, reviewRoutingRate, secondaryPraiseRecall, sentimentAccuracy,
  type Pair, type Prediction, type ThemeScore,
} from './metrics'

export type Classify = (id: string, text: string) => Promise<{ output: ClassificationOutput; promptTokens: number; completionTokens: number; latencyMs: number }>
export type RunTiming = { id: string; latencyMs: number; promptTokens: number; completionTokens: number; error?: string }
export type GoldenRun = { pairs: Pair[]; timings: RunTiming[]; skippedUnlabelled: number }
export type ReportMeta = { date: string; split: 'dev' | 'test'; model: string; promptVersion: string }

// Mirrors production routing: a result goes to human review when flagged or below 0.6 confidence.
export function toPrediction(output: ClassificationOutput): Prediction {
  return {
    theme: output.theme as Theme6,
    secondary: (output.secondary_themes ?? []).filter((t) => t !== output.theme) as Theme6[],
    sentiment: output.sentiment,
    routedToReview: output.requires_human_review || output.confidence < 0.6,
  }
}

export async function evaluateItems(
  items: GoldenItem[], labels: Map<string, GoldenLabel>, split: 'dev' | 'test', classify: Classify, delayMs: number,
): Promise<GoldenRun> {
  const inSplit = items.filter((item) => item.split === split)
  const labelled = inSplit.filter((item) => labels.has(item.id))
  const pairs: Pair[] = []
  const timings: RunTiming[] = []
  for (const [index, item] of labelled.entries()) {
    if (index > 0 && delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    const started = Date.now()
    try {
      const result = await classify(item.id, item.text)
      pairs.push({ id: item.id, expected: labels.get(item.id)!, predicted: toPrediction(result.output) })
      timings.push({ id: item.id, latencyMs: result.latencyMs, promptTokens: result.promptTokens, completionTokens: result.completionTokens })
    } catch (error) {
      // A failed call is a wrong answer, not a missing one: dropping it would inflate recall.
      pairs.push({ id: item.id, expected: labels.get(item.id)!, predicted: null })
      timings.push({ id: item.id, latencyMs: Date.now() - started, promptTokens: 0, completionTokens: 0, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { pairs, timings, skippedUnlabelled: inSplit.length - labelled.length }
}

export type GoldenReport = ReportMeta & {
  n: number
  invalid: number
  skippedUnlabelled: number
  perTheme: Record<Theme6, ThemeScore>
  macroF1: number
  sentimentAccuracy: number
  secondaryPraiseRecall: number
  praiseItems: number
  reviewRoutingRate: number
  confusion: ReturnType<typeof confusionMatrix>
  latencyMs: { mean: number; p95: number }
  totalTokens: number
  tokensPerItem: number
}

export function buildReport(meta: ReportMeta, run: GoldenRun): GoldenReport {
  const latencies = run.timings.map((t) => t.latencyMs).sort((a, b) => a - b)
  const totalTokens = run.timings.reduce((sum, t) => sum + t.promptTokens + t.completionTokens, 0)
  const valid = run.timings.filter((t) => !t.error).length
  const perTheme = perThemeScores(run.pairs)
  return {
    ...meta,
    n: run.pairs.length,
    invalid: run.pairs.filter((p) => !p.predicted).length,
    skippedUnlabelled: run.skippedUnlabelled,
    perTheme,
    macroF1: macroF1(perTheme),
    sentimentAccuracy: sentimentAccuracy(run.pairs),
    secondaryPraiseRecall: secondaryPraiseRecall(run.pairs),
    praiseItems: run.pairs.filter((p) => p.expected.secondary.includes('praise')).length,
    reviewRoutingRate: reviewRoutingRate(run.pairs),
    confusion: confusionMatrix(run.pairs),
    latencyMs: {
      mean: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      p95: latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] : 0,
    },
    totalTokens,
    tokensPerItem: valid ? Math.round(totalTokens / valid) : 0,
  }
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const name = (t: Theme6) => formatTheme(t.toUpperCase())

export function renderMarkdown(r: GoldenReport): string {
  const rows = EVALUATION_CATEGORIES.map((t) => {
    const s = r.perTheme[t]
    return `| ${name(t)} | ${s.support} | ${pct(s.precision)} | ${pct(s.recall)} | ${s.f1.toFixed(3)} |`
  })
  const columns = [...EVALUATION_CATEGORIES, 'invalid'] as const
  const confusion = EVALUATION_CATEGORIES.map((t) => `| ${name(t)} | ${columns.map((c) => r.confusion[t][c]).join(' | ')} |`)
  return [
    `# Golden-set classifier evaluation — ${r.split} split, ${r.date}`,
    '',
    `Model: \`${r.model}\` · prompt version \`${r.promptVersion}\` · items scored: ${r.n} · unlabelled skipped: ${r.skippedUnlabelled}`,
    '',
    `- Macro-F1 (themes labelled or predicted): **${r.macroF1.toFixed(3)}**`,
    `- Sentiment accuracy: **${pct(r.sentimentAccuracy)}**`,
    `- Hidden-praise recall: ${r.praiseItems ? `${pct(r.secondaryPraiseRecall)} of ${r.praiseItems}` : 'n/a (no labelled items)'}`,
    `- Sent to human review: ${pct(r.reviewRoutingRate)}`,
    `- Invalid outputs: ${r.invalid}`,
    `- Latency: mean ${r.latencyMs.mean} ms, p95 ${r.latencyMs.p95} ms · tokens: ${r.totalTokens} total, ${r.tokensPerItem} per item`,
    '',
    '| Theme | Support | Precision | Recall | F1 |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## Confusion matrix (rows: human label, columns: model)',
    '',
    `| | ${columns.map((c) => (c === 'invalid' ? 'Invalid' : name(c))).join(' | ')} |`,
    `| --- |${columns.map(() => ' --- |').join('')}`,
    ...confusion,
    '',
  ].join('\n')
}

// Every run keeps its own file: a later run the same day gets -2, -3, … so no result can be silently replaced.
export function reportBasePath(dir: string, date: string, split: 'dev' | 'test'): string {
  const base = join(dir, `${date}-golden-${split}`)
  if (!existsSync(`${base}.json`)) return base
  let n = 2
  while (existsSync(`${base}-${n}.json`)) n += 1
  return `${base}-${n}`
}
