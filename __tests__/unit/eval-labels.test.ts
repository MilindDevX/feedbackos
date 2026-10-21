/**
 * UNIT TEST: blind labelling for the golden set — label validation, resumable storage, and a local-only API
 * that never reveals the sampling hint (or any model output) to the person labelling.
 */
jest.mock('@/lib/local-test-mode', () => ({ localTestMode: jest.fn(() => true), isLocalHost: jest.fn(() => true) }))

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { localTestMode } from '@/lib/local-test-mode'
import { writeJsonl, type GoldenItem } from '@/lib/eval/golden'
import { appendLabel, nextUnlabelled, parseLabel, readLabels, type GoldenLabel } from '@/lib/eval/labels'
import { GET, POST } from '@/app/api/eval/labels/route'

const label = (id: string, overrides: Partial<GoldenLabel> = {}): GoldenLabel => ({
  id, theme: 'bug_problem', secondary: [], sentiment: 'negative', productArea: 'Other', labelledAt: '2026-10-21T10:00:00.000Z', ...overrides,
})
const items: GoldenItem[] = [
  { id: 'a', text: 'Crashes on login, "every" time, sadly.', split: 'dev', hint: 'bug_problem' },
  { id: 'b', text: 'Love it', split: 'test', hint: 'praise' },
  { id: 'c', text: 'Please add dark mode', split: 'test', hint: 'feature_request' },
]

function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'labels-'))
  writeJsonl(join(dir, 'items.jsonl'), items)
  process.env.GOLDEN_DIR = dir
  return dir
}

describe('parseLabel', () => {
  it('accepts a valid label', () => {
    expect(parseLabel(label('a', { secondary: ['praise'] })).secondary).toEqual(['praise'])
  })
  it('rejects a secondary theme equal to the primary, and more than two secondaries', () => {
    expect(() => parseLabel(label('a', { secondary: ['bug_problem'] }))).toThrow()
    expect(() => parseLabel(label('a', { secondary: ['praise', 'other', 'question_support'] }))).toThrow()
  })
})

describe('label storage', () => {
  it('keeps the latest label per item and resumes at the first unlabelled one', () => {
    const dir = workspace()
    const path = join(dir, 'labels.csv')
    appendLabel(path, label('a'))
    appendLabel(path, label('a', { theme: 'usability_issue' }))
    const labels = readLabels(path)
    expect(labels.size).toBe(1)
    expect(labels.get('a')?.theme).toBe('usability_issue')
    expect(nextUnlabelled(items, labels)?.id).toBe('b')
  })
  it('reads an empty set when nothing is labelled yet', () => {
    const dir = workspace()
    expect(readLabels(join(dir, 'labels.csv')).size).toBe(0)
  })
})

describe('/api/eval/labels', () => {
  beforeEach(() => jest.mocked(localTestMode).mockReturnValue(true))
  const req = (method = 'GET', body?: unknown) => new NextRequest('http://localhost:3000/api/eval/labels', {
    method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  })

  it('serves the next item without its sampling hint, then advances after a label is saved', async () => {
    workspace()
    const first = await (await GET(req())).json()
    expect(first).toEqual({ item: { id: 'a', text: items[0].text }, done: 0, total: 3 })
    expect((await POST(req('POST', label('a')))).status).toBe(200)
    const second = await (await GET(req())).json()
    expect(second.item.id).toBe('b')
    expect(second.done).toBe(1)
  })

  it('rejects an invalid label and a label for an unknown item', async () => {
    workspace()
    expect((await POST(req('POST', { id: 'a', theme: 'nope' }))).status).toBe(422)
    expect((await POST(req('POST', label('zzz')))).status).toBe(404)
  })

  it('does not exist outside local test mode', async () => {
    workspace()
    jest.mocked(localTestMode).mockReturnValue(false)
    expect((await GET(req())).status).toBe(404)
    expect((await POST(req('POST', label('a')))).status).toBe(404)
  })
})
