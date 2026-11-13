// ABOUTME: Builds evaluation/golden/items.jsonl from the CC BY 4.0 app-review dataset named in evaluation/golden/SOURCE.md.
// Usage: node --import tsx scripts/golden/build.ts --zip=<path to downloaded dataset zip>
// Streams the CSVs out of the zip (the large pool only partly), so nothing big is unpacked to disk.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import { EVALUATION_CATEGORIES } from '../../lib/ai/evaluation'
import { assignSplits, cleanReviewText, dedupe, keywordHint, replaceExcluded, stratifiedSample, writeJsonl } from '../../lib/eval/golden'

const EXPECTED_MD5 = '6a2237fc3eeed4990805285985e7f288'
const SEED = 20261021
const POOLS = [
  { path: 'data/02_cleaned_review_candidates/en_explanation/2024-12-20T19-55-42.075Z_en_explanation_reviews_cleaned.csv', maxRows: Infinity },
  { path: 'data/02_cleaned_review_candidates/en_no_explanation_needs/2024-12-20T19-55-42.075Z_en_no_explanation_needs_reviews_cleaned.csv', maxRows: 150_000 },
]

// Reviews withdrawn after sampling because they end with the writer's name ("Respectfully, Kirsten", "Yours truly
// -Zhirkov", "From Cara/Cindy"). They are swapped one for one so the other 197 items, and their labels, do not move.
const WITHDRAWN = new Set([
  'Google Play Store:com.fng.foxnation:ed0808f9-1732-4811-bc42-48bf476cf4f4',
  'Google Play Store:com.adidas.app:7ae3f469-af39-4e30-bc65-dd120a5a8d7c',
  'Google Play Store:com.ventogames.findthecat:0b320c93-d379-4e58-8907-27e326d1d4df',
])
// Replacements must not end with a sign-off or a name; this is stricter than the pool filter, which cannot change
// without reshuffling the whole sample.
const SIGNED = /\b(respectfully|yours truly|yours|cheers|from|love|thanks,?)\s*[,-]?\s*-?[A-Z][a-z]+(\/[A-Z][a-z]+)?\.?\s*$|[-–—]\s*[A-Z][a-z]+\.?\s*$/

type Row = Record<string, string>

function md5(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('md5')
    createReadStream(path).on('data', (chunk) => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))).on('error', reject)
  })
}

function readPool(zip: string, path: string, maxRows: number): Promise<{ id: string; text: string }[]> {
  return new Promise((resolve, reject) => {
    const unzip = spawn('unzip', ['-p', zip, path])
    const out: { id: string; text: string }[] = []
    let seen = 0
    Papa.parse<Row>(unzip.stdout, {
      header: true,
      step: (result, parser) => {
        const row = result.data
        seen += 1
        if (row.is_bad_quality_rule_based !== 'True' && row.is_bad_quality_model_based !== 'True') {
          const text = cleanReviewText(row.review ?? '')
          if (text) out.push({ id: `${row.store}:${row.app_id}:${row.review_id}`, text })
        }
        if (seen >= maxRows) { parser.abort(); unzip.kill() }
      },
      complete: () => resolve(out),
      error: reject,
    })
  })
}

async function main() {
  const zip = process.argv.find((arg) => arg.startsWith('--zip='))?.slice(6)
  if (!zip) throw new Error('Pass --zip=<path to the dataset zip from evaluation/golden/SOURCE.md>')
  const checksum = await md5(zip)
  if (checksum !== EXPECTED_MD5) throw new Error(`Checksum mismatch: ${checksum}`)

  const pools = await Promise.all(POOLS.map((pool) => readPool(zip, pool.path, pool.maxRows)))
  const seenIds = new Set<string>()
  const unique = dedupe(pools.flat().filter((item) => !seenIds.has(item.id) && seenIds.add(item.id)))
  const hinted = unique.map((item) => ({ ...item, hint: keywordHint(item.text) }))
  const sample = replaceExcluded(stratifiedSample(hinted, 20, 200, SEED), hinted, WITHDRAWN, SEED, (item) => !SIGNED.test(item.text))
  const items = assignSplits(sample, 50, SEED).map(({ id, text, split, hint }) => ({ id, text, split, hint }))

  const dir = join(process.cwd(), 'evaluation', 'golden')
  writeJsonl(join(dir, 'items.jsonl'), items)
  const count = (key: 'hint' | 'split', value: string) => items.filter((item) => item[key] === value).length
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    source: 'https://zenodo.org/records/20359757',
    licence: 'CC BY 4.0',
    md5: checksum,
    seed: SEED,
    builtAt: new Date().toISOString(),
    poolSizes: pools.map((pool, i) => ({ file: POOLS[i].path.split('/').pop(), usableReviews: pool.length })),
    afterDedupe: unique.length,
    withdrawnAndReplaced: [...WITHDRAWN],
    total: items.length,
    splits: { dev: count('split', 'dev'), test: count('split', 'test') },
    keywordHints: Object.fromEntries(EVALUATION_CATEGORIES.map((theme) => [theme, count('hint', theme)])),
  }, null, 2) + '\n')
  console.log(`Wrote ${items.length} items (dev ${count('split', 'dev')}, test ${count('split', 'test')}) to evaluation/golden/items.jsonl`)
}

main().catch((error) => { console.error(error); process.exit(1) })
