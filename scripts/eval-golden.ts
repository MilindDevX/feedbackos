// ABOUTME: Measures the classifier on the human-labelled golden set and writes a dated JSON + Markdown report.
// Usage: node --env-file=.env --import tsx scripts/eval-golden.ts --split=dev [--delay-ms=9000] [--allow-locked-test]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertEvaluationSplitAllowed } from '../lib/ai/evaluation'
import { buildSystemPrompt, buildUserPrompt } from '../lib/ai/prompts'
import { REVIEW_CONFIDENCE_THRESHOLD, classificationJsonSchema } from '../lib/ai/schemas'
import { readJsonl, type GoldenItem } from '../lib/eval/golden'
import { PRODUCT_AREAS, readLabels } from '../lib/eval/labels'
import { buildReport, classifierFingerprint, evaluateItems, renderMarkdown, reportBasePath } from '../lib/eval/report'

const option = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1]

async function main() {
  const split = (option('split') ?? 'dev') as 'dev' | 'test'
  assertEvaluationSplitAllowed(split, process.argv.includes('--allow-locked-test'))
  const delayMs = Number(option('delay-ms') ?? 9000)
  const dir = process.env.GOLDEN_DIR ?? join(process.cwd(), 'evaluation', 'golden')
  const items = readJsonl<GoldenItem>(join(dir, 'items.jsonl'))
  const labels = readLabels(join(dir, 'labels.csv'))
  const { classifyFeedback } = await import('../lib/ai/classify')

  let model = 'unknown'
  const run = await evaluateItems(items, labels, split, async (id, text) => {
    const result = await classifyFeedback(id, text, [...PRODUCT_AREAS])
    model = result.modelUsed
    return result
  }, delayMs)

  const date = new Date().toISOString().slice(0, 10)
  const promptVersion = classifierFingerprint({
    systemPrompt: buildSystemPrompt(),
    userPromptTemplate: buildUserPrompt('{{TEXT}}', [...PRODUCT_AREAS]),
    schema: JSON.stringify(classificationJsonSchema),
    model,
    reviewThreshold: REVIEW_CONFIDENCE_THRESHOLD,
  })
  const report = buildReport({ date, split, model, promptVersion }, run)
  const outDir = join(process.cwd(), 'evaluation', 'reports')
  mkdirSync(outDir, { recursive: true })
  const base = reportBasePath(outDir, date, split)
  writeFileSync(`${base}.json`, JSON.stringify({ report, timings: run.timings, pairs: run.pairs }, null, 2) + '\n')
  writeFileSync(`${base}.md`, renderMarkdown(report))
  console.log(`Scored ${report.n} (${report.skippedUnlabelled} unlabelled skipped, ${report.invalid} invalid). Macro-F1 ${report.macroF1.toFixed(3)}.`)
  console.log(`Wrote ${base}.json and ${base}.md`)
}

main().catch((error) => { console.error(error); process.exit(1) })
