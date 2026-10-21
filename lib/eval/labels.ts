// ABOUTME: Milind's blind golden-set labels: validation and append-only CSV storage that resumes after any break.
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import Papa from 'papaparse'
import { z } from 'zod'
import { EVALUATION_CATEGORIES } from '@/lib/ai/evaluation'
import type { GoldenItem, Theme6 } from './golden'

export const SENTIMENTS = ['positive', 'negative', 'neutral', 'mixed'] as const
export const PRODUCT_AREAS = ['Dashboard', 'Authentication', 'API', 'Billing', 'Onboarding', 'Integrations', 'Other'] as const

export type GoldenLabel = {
  id: string
  theme: Theme6
  secondary: Theme6[]
  sentiment: (typeof SENTIMENTS)[number]
  productArea: string
  labelledAt: string
}

const LabelSchema = z.object({
  id: z.string().min(1),
  theme: z.enum(EVALUATION_CATEGORIES),
  secondary: z.array(z.enum(EVALUATION_CATEGORIES)).max(2),
  sentiment: z.enum(SENTIMENTS),
  productArea: z.enum(PRODUCT_AREAS),
  labelledAt: z.string().datetime(),
}).refine((label) => !label.secondary.includes(label.theme), { message: 'A secondary theme cannot repeat the primary theme' })
  .refine((label) => new Set(label.secondary).size === label.secondary.length, { message: 'Secondary themes must be distinct' })

export function parseLabel(input: unknown): GoldenLabel {
  return LabelSchema.parse(input)
}

const COLUMNS = ['id', 'theme', 'secondary', 'sentiment', 'productArea', 'labelledAt'] as const

// Append-only: a relabel adds a row, and readLabels keeps the last row per item, so nothing is ever lost.
export function appendLabel(path: string, label: GoldenLabel): void {
  const header = existsSync(path) ? '' : COLUMNS.join(',') + '\n'
  const row = Papa.unparse([[label.id, label.theme, label.secondary.join(';'), label.sentiment, label.productArea, label.labelledAt]], { quotes: true })
  appendFileSync(path, header + row + '\n', 'utf8')
}

export function readLabels(path: string): Map<string, GoldenLabel> {
  const labels = new Map<string, GoldenLabel>()
  if (!existsSync(path)) return labels
  const rows = Papa.parse<Record<string, string>>(readFileSync(path, 'utf8'), { header: true, skipEmptyLines: true }).data
  for (const row of rows) {
    labels.set(row.id, parseLabel({ ...row, secondary: row.secondary ? row.secondary.split(';') : [] }))
  }
  return labels
}

export function nextUnlabelled(items: GoldenItem[], labels: Map<string, GoldenLabel>): GoldenItem | null {
  return items.find((item) => !labels.has(item.id)) ?? null
}
