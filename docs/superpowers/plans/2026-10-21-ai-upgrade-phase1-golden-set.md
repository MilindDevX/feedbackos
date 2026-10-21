# AI Upgrade Phase 1: Golden Set and Classifier Evaluation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure today's FeedbackOS classifier honestly on about 200 real, openly licensed reviews that Milind labels blind, producing per-theme precision/recall/F1 and a dated report.

**Architecture:** Pure, tested helpers in `lib/eval/` (cleaning, sampling, splitting, metrics) feed two scripts: one builds the golden set from the chosen dataset, one runs the classifier and writes reports. A local-only labelling page (behind `LOCAL_TEST_MODE`) writes Milind's blind labels to CSV. Nothing in this phase touches production.

**Tech Stack:** TypeScript, Next.js 16 route + page (local only), Jest, `tsx` scripts, existing `classifyFeedback` (Groq `openai/gpt-oss-120b`).

**Spec:** `docs/superpowers/specs/2026-10-21-flagship-ai-upgrade-design.md` (sections 1, 5, 6 phase 1, 8).

## Global Constraints

- Golden set ≈ 200 items; each of the 6 themes ≥ 20 items where the source allows; split **50 dev / 150 locked test**, fixed by a seeded shuffle (seed `20261021`).
- Labels are blind: the labelling page never shows a model prediction.
- Pre-sampling may use keyword heuristics, **never the classifier's own labels**.
- Strip names, emails and URLs; English only; deduplicate.
- Licence must be recorded in `evaluation/golden/SOURCE.md` before data is used. If redistribution is not clearly allowed, review text stays out of git (gitignored) and only source IDs + Milind's labels are committed, plus a reproducible download step.
- Locked split runs require `--allow-locked-test`; never tune the prompt while looking at locked results.
- Requests paced to the free tier (`--delay-ms`, default 9000) and run only against a local/disposable database (classification itself needs no database).
- Reports: `evaluation/reports/<YYYY-MM-DD>-golden-<split>.json` + `.md`.
- The labelling page and API return 404 unless `localTestMode()` is true and the host is loopback (reuse `lib/local-test-mode.ts`).
- No new secrets, services or dependencies beyond what the chosen dataset download needs (prefer plain `fetch` of a CSV/JSON/Parquet-free format; no Python).
- Commits never credit AI.

## Review Focus

- **Review text with tricky CSV content** (commas, quotes, newlines, emoji) must survive the round trip through `items.jsonl`/`labels.csv` unchanged → Task 2 and Task 3 tests.
- **Labelling session interrupted mid-item or the page reloaded** must resume at the first unlabelled item without duplicating or losing labels → Task 3 test.
- **A theme with fewer than 20 available items** must not crash sampling; the report must state the actual count per theme → Task 2 test and Task 5 report.
- **Classifier errors or 429s during a run** must count as invalid outputs (not be dropped), so recall is not inflated → Task 5 test.
- **A theme with zero predictions** must give precision 0 (not NaN) and still appear in the table → Task 4 test.

---

### Task 1: Choose the dataset (licence gate with Milind)

**Files:**
- Create: `evaluation/golden/SOURCE.md`

**Interfaces:**
- Produces: `SOURCE.md` naming dataset, URL, exact licence text/link, whether redistribution is allowed (yes/no), download URL/format, and the field used as review text and stable item ID.

- [ ] **Step 1:** Shortlist 2–3 candidates of real English product/app/service reviews. For each, record licence evidence from the dataset card and any upstream source terms, size, text field, ID field, and download format.
- [ ] **Step 2:** Present the shortlist to Milind with a recommendation and stop until he picks one (the spec's licence risk gate).
- [ ] **Step 3:** Write `SOURCE.md` for the chosen dataset, including the `redistribution: yes|no` line that Task 2 reads.
- [ ] **Step 4:** Commit `evaluation/golden/SOURCE.md` (`docs(eval): record golden-set source and licence`).

### Task 2: Golden-set builder

**Files:**
- Create: `lib/eval/golden.ts`, `scripts/golden/build.ts`, `evaluation/golden/.gitignore` (ignores `items.jsonl` when redistribution is `no`)
- Test: `__tests__/unit/eval-golden.test.ts`
- Modify: `package.json` (script `"golden:build": "node --import tsx scripts/golden/build.ts"`)

**Interfaces:**
- Produces (in `lib/eval/golden.ts`):
  - `type GoldenItem = { id: string; text: string; split: 'dev' | 'test'; hint: Theme6 }` where `Theme6` is the six lowercase themes from `EVALUATION_CATEGORIES`.
  - `cleanReviewText(raw: string): string | null` — removes emails, URLs, and `@handles`; collapses whitespace; returns `null` if under 15 characters or not mostly ASCII letters (English filter).
  - `dedupe(items: {id: string; text: string}[]): {id: string; text: string}[]` — by normalised lowercase text.
  - `keywordHint(text: string): Theme6` — keyword heuristic used only for stratification.
  - `stratifiedSample<T extends {hint: Theme6}>(items: T[], perTheme: number, total: number, seed: number): T[]`
  - `assignSplits<T>(items: T[], devCount: number, seed: number): (T & { split: 'dev' | 'test' })[]`
  - `writeJsonl(path, items)`, `readJsonl<T>(path): T[]`

- [ ] **Step 1: Write failing tests**

```ts
test('cleanReviewText strips emails, urls and handles', () => {
  expect(cleanReviewText('Mail me at a.b@x.com or see https://x.io @bob  great app'))
    .toBe('Mail me at or see great app')
})
test('cleanReviewText rejects short or non-English text', () => {
  expect(cleanReviewText('ok')).toBeNull()
  expect(cleanReviewText('これはとても良いアプリです本当に')).toBeNull()
})
test('stratifiedSample takes perTheme from each theme, fills the rest, and is deterministic', () => {
  const pool = Array.from({ length: 600 }, (_, i) => ({ id: `${i}`, hint: EVALUATION_CATEGORIES[i % 6] }))
  const a = stratifiedSample(pool, 20, 200, 20261021)
  expect(a).toHaveLength(200)
  for (const t of EVALUATION_CATEGORIES) expect(a.filter((x) => x.hint === t).length).toBeGreaterThanOrEqual(20)
  expect(stratifiedSample(pool, 20, 200, 20261021).map((x) => x.id)).toEqual(a.map((x) => x.id))
})
test('stratifiedSample does not crash when a theme is short', () => {
  const pool = [...Array.from({ length: 300 }, (_, i) => ({ id: `${i}`, hint: 'bug_problem' as const })), { id: 'q', hint: 'question_support' as const }]
  expect(stratifiedSample(pool, 20, 200, 1)).toHaveLength(200)
})
test('assignSplits gives exactly 50 dev and the rest test, deterministically', () => {
  const s = assignSplits(Array.from({ length: 200 }, (_, i) => ({ id: `${i}` })), 50, 20261021)
  expect(s.filter((x) => x.split === 'dev')).toHaveLength(50)
  expect(assignSplits(Array.from({ length: 200 }, (_, i) => ({ id: `${i}` })), 50, 20261021)).toEqual(s)
})
test('jsonl round-trips quotes, commas, newlines and emoji', () => { /* write then read a temp file */ })
```

- [ ] **Step 2:** Run `pnpm test -- eval-golden` → FAIL (module missing).
- [ ] **Step 3:** Implement `lib/eval/golden.ts` (seeded PRNG: mulberry32; shuffle with it).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Implement `scripts/golden/build.ts`: read `SOURCE.md`, download the dataset, map to `{id, text}`, clean, dedupe, hint, sample 200 (20 per theme), split 50/150, write `evaluation/golden/items.jsonl` and `evaluation/golden/manifest.json` (counts per hint and split, seed, source URL, build date).
- [ ] **Step 6:** Run `pnpm golden:build`; check `manifest.json` totals (200; dev 50; test 150) and print per-hint counts.
- [ ] **Step 7:** Commit `lib/eval/golden.ts`, the test, the script, `package.json`, `manifest.json`, `.gitignore`, and `items.jsonl` only if redistribution is `yes`.

### Task 3: Blind labelling page (local only)

**Files:**
- Create: `lib/eval/labels.ts`, `app/api/eval/labels/route.ts`, `app/eval/label/page.tsx`, `app/eval/label/LabelForm.tsx`
- Test: `__tests__/unit/eval-labels.test.ts`

**Interfaces:**
- Consumes: `GoldenItem`, `readJsonl` (Task 2); `localTestMode`, `isLocalHost` (`lib/local-test-mode.ts`).
- Produces:
  - `type GoldenLabel = { id: string; theme: Theme6; secondary: Theme6[]; sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'; productArea: string; labelledAt: string }`
  - `parseLabel(input: unknown): GoldenLabel` (Zod; secondary excludes the primary theme, max 2)
  - `appendLabel(path: string, label: GoldenLabel): void` (CSV, one row per label; a later row for the same id replaces the earlier one on read)
  - `readLabels(path: string): Map<string, GoldenLabel>`
  - `nextUnlabelled(items: GoldenItem[], labels: Map<string, GoldenLabel>): GoldenItem | null`
  - `GET /api/eval/labels` → `{ item: { id, text } | null, done, total }` (never includes `hint`); `POST` with a `GoldenLabel` body → `{ ok: true }`.

- [ ] **Step 1: Write failing tests** — `parseLabel` rejects a secondary equal to the primary and more than 2 secondaries; `appendLabel`/`readLabels` round-trip text-free rows and keep the latest row per id; `nextUnlabelled` resumes at the first unlabelled item after a simulated reload; the GET response for an item has no `hint` key; the route returns 404 when `localTestMode()` is false.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `lib/eval/labels.ts` and the route (Node runtime, `fs` writes to `evaluation/golden/labels.csv`).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Build the page: review text, theme buttons with shortcuts `1`–`6`, secondary toggles (`Shift+1`–`6`), sentiment `P/N/U/M` (positive/negative/neutral/mixed), product area select (FeedbackOS default areas: Dashboard, Authentication, API, Billing, Onboarding, Integrations, Other), Save (`Enter`), progress "37 / 200", Undo last. No model output anywhere on the page.
- [ ] **Step 6:** Browser check on localhost with `LOCAL_TEST_MODE=1`: label 3 items by keyboard, reload, confirm it resumes at item 4 and `labels.csv` has 3 rows; axe-clean; production build returns 404 for `/eval/label` and `/api/eval/labels`.
- [ ] **Step 7:** Commit (`feat(eval): blind labelling page for the golden set`).

### Task 4: Metrics

**Files:**
- Create: `lib/eval/metrics.ts`
- Test: `__tests__/unit/eval-metrics.test.ts`

**Interfaces:**
- Produces:
  - `type Pair = { id: string; expected: GoldenLabel; predicted: { theme: Theme6; secondary: Theme6[]; sentiment: string; routedToReview: boolean } | null }`
  - `perThemeScores(pairs: Pair[]): Record<Theme6, { precision: number; recall: number; f1: number; support: number }>` (`null` predictions count as wrong, never dropped; zero predicted → precision 0)
  - `macroF1(scores): number`
  - `confusionMatrix(pairs): Record<Theme6, Record<Theme6 | 'invalid', number>>`
  - `sentimentAccuracy(pairs): number`
  - `secondaryPraiseRecall(pairs): number` (over items whose expected `secondary` includes `praise`)
  - `reviewRoutingRate(pairs): number` (share of valid predictions with `routedToReview`, i.e. `requires_human_review` or confidence < 0.6)

- [ ] **Step 1: Write failing tests** with a hand-computed 6-item fixture: exact precision/recall/F1 per theme; a theme never predicted → precision 0, not NaN; one `null` prediction lowers recall and appears under `invalid` in the confusion matrix; praise recall 1/2 when one of two expected secondary-praise items is caught; routing rate 1/5 when one of five valid predictions is routed.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit (`feat(eval): per-theme metrics for the golden set`).

### Task 5: Classifier evaluation script and report

**Files:**
- Create: `scripts/eval-golden.ts`, `lib/eval/report.ts`
- Test: `__tests__/unit/eval-report.test.ts`
- Modify: `package.json` (script `"eval:golden": "node --import tsx scripts/eval-golden.ts"`), `evaluation/README.md` (how to run, split rules)

**Interfaces:**
- Consumes: Tasks 2–4; `classifyFeedback(id, text, productAreas)` from `lib/ai/classify.ts`.
- Produces: `buildReport(meta, pairs, timings): GoldenReport` and `renderMarkdown(report): string` in `lib/eval/report.ts`; `GoldenReport` includes date, split, model, prompt version (hash of the system prompt), n, per-theme table, macro-F1, sentiment accuracy, praise recall, review-routing rate, confusion matrix, invalid count, mean/p95 latency, total tokens, tokens per item.

- [ ] **Step 1: Write failing tests** — `renderMarkdown` produces a table with all six themes even when one has zero support; a run with 2 provider errors reports `invalid: 2` and uses them in recall; the CLI guard throws on `--split=test` without `--allow-locked-test` (reuse `assertEvaluationSplitAllowed`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `lib/eval/report.ts` and the script (flags `--split=dev|test`, `--delay-ms`, `--allow-locked-test`; only labelled items are evaluated; prints how many were skipped as unlabelled).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Smoke run on 5 labelled dev items (`--delay-ms=9000`), check the report files appear and numbers match a hand count.
- [ ] **Step 6:** Commit (`feat(eval): golden-set classifier evaluation and reports`).

### Task 6: Labelling session and baseline measurement (Milind + agent)

**Files:**
- Create: `evaluation/golden/labels.csv` (Milind's labels), `evaluation/reports/<date>-golden-dev.{json,md}`, `evaluation/reports/<date>-golden-test.{json,md}`

- [ ] **Step 1:** Milind labels all ~200 items on the local page (sittings of any length; resume works).
- [ ] **Step 2:** Run `pnpm eval:golden --split=dev --delay-ms=9000`.
- [ ] **Step 3:** With Milind's OK, run `pnpm eval:golden --split=test --allow-locked-test --delay-ms=9000` once. Record the result; do not tune against it.
- [ ] **Step 4:** Update `brain/current-focus.md` with the headline numbers and report paths.
- [ ] **Step 5:** Commit labels and reports (`docs(eval): golden-set baseline for the current classifier`). Phase 1 ships nothing to production; pushing the branch needs Milind's OK.
