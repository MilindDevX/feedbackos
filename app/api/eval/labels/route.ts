// ABOUTME: Local-only API for the blind labelling page; 404 unless LOCAL_TEST_MODE runs under next dev on loopback.
// ABOUTME: Never serves the sampling hint or the classifier's prediction. An AI-drafted label is sent only in review mode (?drafts=1).
import { join } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { readJsonl, type GoldenItem } from '@/lib/eval/golden'
import { appendLabel, nextUnlabelled, parseLabel, readDrafts, readLabels } from '@/lib/eval/labels'
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
  const draft = next && request.nextUrl.searchParams.get('drafts') === '1'
    ? readDrafts(join(goldenDir(), 'labels-draft.csv')).get(next.id)
    : undefined
  return NextResponse.json({ item: next ? { id: next.id, text: next.text } : null, done, total: items.length, draft })
}

// A website open in the same browser can POST to localhost without a CORS preflight (text/plain body). Requiring a
// JSON content type forces a preflight, and Sec-Fetch-Site rejects cross-site requests outright.
function sameOriginJson(request: NextRequest): boolean {
  const site = request.headers.get('sec-fetch-site')
  return (request.headers.get('content-type') ?? '').startsWith('application/json') && (!site || site === 'same-origin')
}

export async function POST(request: NextRequest) {
  if (!allowed(request)) return notFound()
  if (!sameOriginJson(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
