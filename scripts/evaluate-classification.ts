import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import Papa from 'papaparse'
import {
  assertEvaluationSplitAllowed,
  computeEvaluationMetrics,
  type EvaluationRecord,
} from '../lib/ai/evaluation'

const DATASET_PATH = path.join(process.cwd(), 'evaluation', 'feedbackos-eval-v0.1.csv')
const PRODUCT_AREAS = [
  'Feedback intake/import',
  'AI classification',
  'Review queue',
  'Dashboard/analytics',
  'Search/filtering',
  'Team/organization access',
  'Export/integrations',
  'General/other',
]

type DatasetRow = {
  id: string
  split: string
  category: string
  urgency: string
  sentiment: string
  product_area: string
  requires_human_review: string
  text: string
}

type EvaluationResult = EvaluationRecord & {
  text: string
  modelUsed: string | null
}

function optionValue(name: string): string | undefined {
  const prefix = `${name}=`
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
}

function parseBoolean(value: string, field: string, rowId: string): boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`Invalid ${field} value in ${rowId}: ${value}`)
}

async function main() {
  const split = optionValue('--split') ?? 'dev'
  const allowLockedTest = process.argv.includes('--allow-locked-test')
  const outputPath = optionValue('--output')

  assertEvaluationSplitAllowed(split, allowLockedTest)

  const csv = await readFile(DATASET_PATH, 'utf8')
  const parsed = Papa.parse<DatasetRow>(csv, {
    header: true,
    skipEmptyLines: true,
  })

  if (parsed.errors.length > 0) {
    throw new Error(`Dataset CSV is invalid: ${parsed.errors[0].message}`)
  }

  const rows = parsed.data.filter((row) => row.split === split)
  if (rows.length === 0) throw new Error(`No evaluation rows found for split: ${split}`)

  const { classifyFeedback } = await import('../lib/ai/classify')
  const results: EvaluationResult[] = []
  for (const row of rows) {
    const expected = {
      category: row.category,
      urgency: row.urgency,
      sentiment: row.sentiment,
      productArea: row.product_area,
      requiresHumanReview: parseBoolean(row.requires_human_review, 'requires_human_review', row.id),
    }

    try {
      const result = await classifyFeedback(row.id, row.text, PRODUCT_AREAS)
      results.push({
        id: row.id,
        text: row.text,
        expected,
        predicted: {
          category: result.output.theme,
          sentiment: result.output.sentiment,
          productArea: result.output.product_area,
          requiresHumanReview: result.output.requires_human_review,
        },
        modelUsed: result.modelUsed,
        latencyMs: result.latencyMs,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      })
    } catch (error) {
      results.push({
        id: row.id,
        text: row.text,
        expected,
        predicted: null,
        modelUsed: null,
        latencyMs: 0,
        promptTokens: 0,
        completionTokens: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const report = {
    dataset: path.relative(process.cwd(), DATASET_PATH),
    split,
    evaluatedAt: new Date().toISOString(),
    note: 'Urgency accuracy is null because the current classifier contract does not emit urgency.',
    metrics: computeEvaluationMetrics(results),
    results,
  }
  const json = `${JSON.stringify(report, null, 2)}\n`

  if (outputPath) {
    await writeFile(path.resolve(outputPath), json, 'utf8')
    console.log(`Evaluation report written to ${path.resolve(outputPath)}`)
  } else {
    process.stdout.write(json)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
