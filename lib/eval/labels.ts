// ABOUTME: Milind's blind golden-set labels: validation and append-only CSV storage that resumes after any break.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import Papa from 'papaparse'
import { z } from 'zod'
import { EVALUATION_CATEGORIES } from '@/lib/ai/evaluation'
import type { GoldenItem, Theme6 } from './golden'

export const SENTIMENTS = ['positive', 'negative', 'neutral', 'mixed'] as const
// Product areas the classifier chooses from; the golden labels do not score product area (the reviews are consumer apps).
export const PRODUCT_AREAS = ['Dashboard', 'Authentication', 'API', 'Billing', 'Onboarding', 'Integrations', 'Other'] as const

export type GoldenLabel = {
  id: string
  theme: Theme6 | null
  secondary: Theme6[]
  sentiment: (typeof SENTIMENTS)[number] | null
  // A genuinely ambiguous review: kept for the record, left out of the headline scores.
  unsure: boolean
  labelledAt: string
}
export type SureLabel = GoldenLabel & { theme: Theme6; sentiment: (typeof SENTIMENTS)[number]; unsure: false }

const LabelSchema = z.object({
  id: z.string().min(1),
  theme: z.enum(EVALUATION_CATEGORIES).nullable(),
  secondary: z.array(z.enum(EVALUATION_CATEGORIES)).max(2),
  sentiment: z.enum(SENTIMENTS).nullable(),
  unsure: z.boolean().default(false),
  labelledAt: z.string().datetime(),
}).refine((label) => label.unsure || (label.theme !== null && label.sentiment !== null), { message: 'Choose a theme and a sentiment, or mark the review unsure' })
  .refine((label) => !label.theme || !label.secondary.includes(label.theme), { message: 'A secondary theme cannot repeat the primary theme' })
  .refine((label) => new Set(label.secondary).size === label.secondary.length, { message: 'Secondary themes must be distinct' })

export function parseLabel(input: unknown): GoldenLabel {
  return LabelSchema.parse(input)
}

export function isSure(label: GoldenLabel): label is SureLabel {
  return !label.unsure && label.theme !== null && label.sentiment !== null
}

const COLUMNS = ['id', 'theme', 'secondary', 'sentiment', 'unsure', 'labelledAt'] as const

function parseRows(path: string): GoldenLabel[] {
  const rows = Papa.parse<Record<string, string>>(readFileSync(path, 'utf8'), { header: true, skipEmptyLines: true }).data
  // Older files had a productArea column and no unsure column; both are handled here.
  return rows.map((row) => parseLabel({
    id: row.id,
    theme: row.theme || null,
    secondary: row.secondary ? row.secondary.split(';') : [],
    sentiment: row.sentiment || null,
    unsure: row.unsure === 'true',
    labelledAt: row.labelledAt,
  }))
}

function toRow(label: GoldenLabel): string {
  return Papa.unparse([[label.id, label.theme ?? '', label.secondary.join(';'), label.sentiment ?? '', String(label.unsure), label.labelledAt]], { quotes: true })
}

// Append-only: a relabel adds a row, and readLabels keeps the last row per item, so nothing is ever lost.
// A file in the earlier column layout is rewritten once in the current layout before appending.
export function appendLabel(path: string, label: GoldenLabel): void {
  const header = COLUMNS.join(',')
  if (existsSync(path) && readFileSync(path, 'utf8').split('\n')[0].trim() !== header) {
    writeFileSync(path, [header, ...parseRows(path).map(toRow)].join('\n') + '\n', 'utf8')
  }
  appendFileSync(path, (existsSync(path) ? '' : header + '\n') + toRow(label) + '\n', 'utf8')
}

export function readLabels(path: string): Map<string, GoldenLabel> {
  const labels = new Map<string, GoldenLabel>()
  if (!existsSync(path)) return labels
  for (const label of parseRows(path)) labels.set(label.id, label)
  return labels
}

// AI-drafted labels waiting for Milind's review. They live in their own file and are never scored;
// `check` marks the ones the drafter was least sure about.
export type DraftLabel = Pick<GoldenLabel, 'theme' | 'secondary' | 'sentiment' | 'unsure'> & { check: boolean }

export function readDrafts(path: string): Map<string, DraftLabel> {
  const drafts = new Map<string, DraftLabel>()
  if (!existsSync(path)) return drafts
  const checks = Papa.parse<Record<string, string>>(readFileSync(path, 'utf8'), { header: true, skipEmptyLines: true }).data
  parseRows(path).forEach(({ id, theme, secondary, sentiment, unsure }, index) => {
    drafts.set(id, { theme, secondary, sentiment, unsure, check: checks[index].check === 'true' })
  })
  return drafts
}

export function nextUnlabelled(items: GoldenItem[], labels: Map<string, GoldenLabel>): GoldenItem | null {
  return items.find((item) => !labels.has(item.id)) ?? null
}
