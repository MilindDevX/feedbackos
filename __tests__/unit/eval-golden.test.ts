/**
 * UNIT TEST: building the golden set — cleaning real reviews, sampling every theme, and a fixed dev/test split.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EVALUATION_CATEGORIES } from '@/lib/ai/evaluation'
import { assignSplits, cleanReviewText, dedupe, keywordHint, readJsonl, stratifiedSample, writeJsonl } from '@/lib/eval/golden'

test('cleanReviewText strips emails, urls and handles', () => {
  expect(cleanReviewText('Mail me at a.b@x.com or see https://x.io @bob  great app'))
    .toBe('Mail me at or see great app')
})

test('cleanReviewText rejects short or non-English text', () => {
  expect(cleanReviewText('ok')).toBeNull()
  expect(cleanReviewText('これはとても良いアプリです本当にありがとう')).toBeNull()
})

test('dedupe drops reviews that differ only in case and spacing', () => {
  expect(dedupe([{ id: '1', text: 'Great app!' }, { id: '2', text: '  great   APP! ' }, { id: '3', text: 'Crashes on login' }]).map((x) => x.id))
    .toEqual(['1', '3'])
})

test('keywordHint spots an obvious crash report and an obvious request', () => {
  expect(keywordHint('The app crashes every time I open it')).toBe('bug_problem')
  expect(keywordHint('Please add a dark mode option')).toBe('feature_request')
})

test('stratifiedSample takes perTheme from each theme, fills the rest, and is deterministic', () => {
  const pool = Array.from({ length: 600 }, (_, i) => ({ id: `${i}`, hint: EVALUATION_CATEGORIES[i % 6] }))
  const a = stratifiedSample(pool, 20, 200, 20261021)
  expect(a).toHaveLength(200)
  expect(new Set(a.map((x) => x.id)).size).toBe(200)
  for (const t of EVALUATION_CATEGORIES) expect(a.filter((x) => x.hint === t).length).toBeGreaterThanOrEqual(20)
  expect(stratifiedSample(pool, 20, 200, 20261021).map((x) => x.id)).toEqual(a.map((x) => x.id))
})

test('stratifiedSample does not crash when a theme is short', () => {
  const pool = [
    ...Array.from({ length: 300 }, (_, i) => ({ id: `${i}`, hint: 'bug_problem' as const })),
    { id: 'q', hint: 'question_support' as const },
  ]
  const sample = stratifiedSample(pool, 20, 200, 1)
  expect(sample).toHaveLength(200)
  expect(sample.some((x) => x.id === 'q')).toBe(true)
})

test('assignSplits gives exactly 50 dev and the rest test, deterministically', () => {
  const make = () => Array.from({ length: 200 }, (_, i) => ({ id: `${i}` }))
  const s = assignSplits(make(), 50, 20261021)
  expect(s.filter((x) => x.split === 'dev')).toHaveLength(50)
  expect(s.filter((x) => x.split === 'test')).toHaveLength(150)
  expect(assignSplits(make(), 50, 20261021)).toEqual(s)
})

test('jsonl round-trips quotes, commas, newlines and emoji', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'golden-')), 'items.jsonl')
  const items = [{ id: 'a', text: 'He said "no", then left.\nSecond line 😀' }, { id: 'b', text: 'plain' }]
  writeJsonl(path, items)
  expect(readJsonl(path)).toEqual(items)
})
