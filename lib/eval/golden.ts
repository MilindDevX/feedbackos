// ABOUTME: Builds the human-labelled golden set: cleans real reviews, samples every theme, fixes a dev/test split.
// ABOUTME: Sampling uses keyword hints only, never the classifier's own labels, so the measurement stays independent.
import { readFileSync, writeFileSync } from 'node:fs'
import { EVALUATION_CATEGORIES } from '@/lib/ai/evaluation'

export type Theme6 = (typeof EVALUATION_CATEGORIES)[number]
export type GoldenItem = { id: string; text: string; split: 'dev' | 'test'; hint: Theme6 }

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+/gi
const HANDLE = /(^|\s)@\w+/g

// Removes contact details, collapses whitespace, and drops text too short or not mostly English to label.
export function cleanReviewText(raw: string): string | null {
  const text = raw.replace(EMAIL, ' ').replace(URL, ' ').replace(HANDLE, ' ').replace(/\s+/g, ' ').trim()
  if (text.length < 15) return null
  const letters = text.match(/\p{L}/gu) ?? []
  const ascii = letters.filter((ch) => /[A-Za-z]/.test(ch)).length
  return letters.length > 0 && ascii / letters.length >= 0.8 ? text : null
}

export function dedupe<T extends { id: string; text: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.text.toLowerCase().replace(/\s+/g, ' ').trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const HINTS: Array<[Theme6, RegExp]> = [
  ['bug_problem', /\b(crash\w*|bug\w*|error\w*|freez\w*|broken|glitch\w*|not working|doesn'?t work|won'?t (load|open)|fail\w*)\b/i],
  ['feature_request', /\b(please add|add (a|an|the) |would (be|love) (nice|it if)|wish|feature request|should (have|add|let)|need (a|an) option)/i],
  ['question_support', /\?|\b(how (do|can|to)|is there a way|can someone|anyone know)\b/i],
  ['usability_issue', /\b(confus\w*|hard to|difficult|too slow|slow|annoying|can'?t find|cluttered|complicated)\b/i],
  ['praise', /\b(love|great|awesome|amazing|excellent|best|thank\w*|fantastic|perfect)\b/i],
]

// A rough guess used only to make sure every theme is represented in the sample.
export function keywordHint(text: string): Theme6 {
  return HINTS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'other'
}

// mulberry32: small, fast, seedable PRNG so the sample and split are reproducible.
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], seed: number): T[] {
  const next = random(seed)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function stratifiedSample<T extends { hint: Theme6 }>(items: T[], perTheme: number, total: number, seed: number): T[] {
  const shuffled = shuffle(items, seed)
  const chosen = new Set<T>()
  for (const theme of EVALUATION_CATEGORIES) {
    shuffled.filter((item) => item.hint === theme).slice(0, perTheme).forEach((item) => chosen.add(item))
  }
  for (const item of shuffled) {
    if (chosen.size >= total) break
    chosen.add(item)
  }
  return shuffled.filter((item) => chosen.has(item)).slice(0, total)
}

export function assignSplits<T>(items: T[], devCount: number, seed: number): (T & { split: 'dev' | 'test' })[] {
  const dev = new Set(shuffle(items.map((_, index) => index), seed).slice(0, devCount))
  return items.map((item, index) => ({ ...item, split: dev.has(index) ? 'dev' : 'test' }))
}

export function writeJsonl(path: string, items: unknown[]): void {
  writeFileSync(path, items.map((item) => JSON.stringify(item)).join('\n') + '\n', 'utf8')
}

export function readJsonl<T>(path: string): T[] {
  return readFileSync(path, 'utf8').split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line) as T)
}
