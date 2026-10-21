// ABOUTME: Local-only API for the blind labelling page; 404 unless LOCAL_TEST_MODE runs under next dev on loopback.
// ABOUTME: Serves review text only: never the sampling hint or any model prediction, so labels stay unbiased.
import { join } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { readJsonl, type GoldenItem } from '@/lib/eval/golden'
import { appendLabel, nextUnlabelled, parseLabel, readLabels } from '@/lib/eval/labels'
import { isLocalHost, localTestMode } from '@/lib/local-test-mode'

export const runtime = 'nodejs'

const goldenDir = () => process.env.GOLDEN_DIR ?? join(process.cwd(), 'evaluation', 'golden')
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })
const allowed = (request: NextRequest) => localTestMode() && isLocalHost(request.headers.get('host'))

function load() {
  const dir = goldenDir()
  const items = readJsonl<GoldenItem>(join(dir, 'items.jsonl'))
  return { items, labelsPath: join(dir, 'labels.csv') }
}

export async function GET(request: NextRequest) {
  if (!allowed(request)) return notFound()
  const { items, labelsPath } = load()
  const labels = readLabels(labelsPath)
  const next = nextUnlabelled(items, labels)
  const done = items.filter((item) => labels.has(item.id)).length
  return NextResponse.json({ item: next ? { id: next.id, text: next.text } : null, done, total: items.length })
}

export async function POST(request: NextRequest) {
  if (!allowed(request)) return notFound()
  const { items, labelsPath } = load()
  let label
  try {
    label = parseLabel(await request.json())
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid label' }, { status: 422 })
    throw error
  }
  if (!items.some((item) => item.id === label.id)) return notFound()
  appendLabel(labelsPath, label)
  return NextResponse.json({ ok: true })
}
