# Serverless classification implementation plan

> Execution is inline unless Milind explicitly requests delegated agents. Do not commit, push, publish, deploy, or modify production data without separate explicit approval. TDD is required for each production change.

**Goal:** Manual feedback and reclassification complete on the hosted Next.js app without an always-running worker; Neon remains the durable backlog and Groq pacing authority.

**Architecture:** An ID-only Vercel Queue wakes a Function consumer. A Neon-backed reservation/lease limits concurrent Groq calls and daily/minute budgets independently of Queue delivery concurrency. A once-daily Hobby cron repairs stranded pending items; it is not the prompt executor.

**Tech stack:** Next.js 16 App Router, Prisma 5/PostgreSQL (Neon), `@vercel/queue`, Groq through existing `lib/ai/classify.ts`, Jest/Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-no-worker-csv-import-design.md` (approved 2026-09-23). This is phase 1; the CSV plan depends on it.

**Execution status (2026-10-01):** Tasks 1–3 implemented and locally verified, including protected Queue adapter/configuration. Task 4 local checks/docs completed; hosted preview remains unverified and requires separate deployment approval. Actual behavioral tests live under `__tests__/integration/classification-*.test.ts`, `api-routes.test.ts` and `__tests__/unit/classification-*.test.ts`. Reservations also return the exact prepared request/areas; dispatcher ownership is explicit INTERACTIVE/BULK, not inferred from source. Reviewer corrections and verification evidence are in the private execution ledger. Follow `docs/serverless-classification-preview.md` before CSV/production.

**Execution status (2026-10-02):** Isolated Vercel Preview is Ready. Hosted manual submit/classify/reclassify/review, recovery cron and a two-item burst passed against disposable Neon, free Redis and a test Groq key. Failure/retention/provider-usage gates remain open; no production or Git publication is authorized. Evidence and limits: `docs/serverless-classification-preview.md`.

## Global constraints

- Queue messages contain only `feedbackItemId` and `organizationId`; do not send feedback text.
- Authenticated manual submission and reclassification must remain responsive; CSV may process gradually.
- Actual Groq account limits are authoritative; dashboard verified 2026-10-02: 30 RPM, 1,000 RPD, 8,000 TPM and 200,000 tokens/day for `openai/gpt-oss-120b`. The code reserves daily tokens atomically alongside requests/minute tokens and obeys `429` and `Retry-After`. Separate keys still share organization limits; hosted telemetry must account for other callers.
- Queue push concurrency is not trusted until preview verification. Preview failure to bound Groq usage is a production release blocker.
- Do not run Prisma against production during development. Existing taxonomy migration is not released by this plan.
- Preserve Zendesk and Intercom code for now; phase 2 removes only the CSV row-payload worker.

## File map

| File | Responsibility |
| --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/<timestamp>_classification_dispatch/migration.sql` | Durable provider budget and per-item lease/attempt fields. |
| `lib/classification/dispatch.ts` | Atomic reserve, release, defer, and select next eligible item. |
| `lib/classification/process.ts` | Status/ownership guard, AI call, conditional persistence, final failure. |
| `lib/classification/publish.ts` | ID-only Queue send with bounded delay/idempotency. |
| `app/api/queues/classify/route.ts`, `vercel.json` | Private Queue push consumer and daily recovery cron. |
| `app/api/cron/classification/route.ts` | Authorized daily Neon backlog/expired-lease repair. |
| `app/api/feedback/route.ts`, `app/api/feedback/[id]/route.ts` | Replace BullMQ publish for manual/reclassify. |
| `__tests__/unit/classification-dispatch.test.ts`, `__tests__/unit/classification-consumer.test.ts`, `__tests__/unit/api-routes.test.ts` | Red/green behavioral tests. |

## Task 1 — Durable reservation and retry state

**Files:** Modify `prisma/schema.prisma`; create a named SQL migration and `lib/classification/dispatch.ts`; test `__tests__/unit/classification-dispatch.test.ts`.

**Interface:** `reserveClassification(feedbackItemId, organizationId, now): Promise<{kind:'ready'; leaseToken:string}|{kind:'defer'; delaySeconds:number}|{kind:'skip'}>`. `releaseClassification(feedbackItemId, leaseToken, outcome): Promise<void>`. `nextPendingClassification(): Promise<{feedbackItemId:string;organizationId:string}|null>` prioritizes MANUAL/reclassification over CSV.

- [ ] Write failing tests: concurrent reservations yield one `ready`; wrong organization gives `skip`; Groq minute/day budgets yield positive `defer`; expired lease can be reclaimed; terminal REVIEWED/CLASSIFIED items give `skip`.

```ts
const [a, b] = await Promise.all([
  reserveClassification(id, orgId, now),
  reserveClassification(id, orgId, now),
])
expect([a.kind, b.kind].sort()).toEqual(['ready', 'skip'])
```

- [ ] Run `npm test -- --runInBand __tests__/unit/classification-dispatch.test.ts` and confirm behavioral failure before implementation.
- [ ] Add Prisma state: per-item `classificationLeaseToken`, `classificationLeaseUntil`, `classificationAttempts`, `classificationNextAttemptAt`, and one provider budget row keyed by provider/model with minute/day windows, reserved request/token counts, and `nextAllowedAt`. Use a short Postgres transaction/row lock for reservation, never hold a DB transaction open during a Groq call. Check estimate against TPM before reservation; reject/defer oversized input rather than exceeding limits. Implement bounded three-attempt state transitions and `Retry-After` deferral.

```sql
SELECT id FROM "ClassificationBudget" WHERE id = 'groq:gpt-oss-120b' FOR UPDATE;
-- Check/reset windows, reserve one slot, and set per-item lease atomically.
```

- [ ] Run targeted Jest red-to-green and `npx prisma validate` against a disposable non-production database configuration. Inspect generated SQL for data preservation and index coverage; do not apply to Neon main.

## Task 2 — ID-only Queue consumer and guarded classification

**Files:** Create `lib/classification/process.ts`, `lib/classification/publish.ts`, `app/api/queues/classify/route.ts`; modify `vercel.json`; test `__tests__/unit/classification-consumer.test.ts`.

**Interface:** `publishClassification({feedbackItemId,organizationId}, delaySeconds?)` sends only IDs. `processClassification({feedbackItemId,organizationId})` returns `done|skipped|deferred`, and never overwrites a reviewed or newer classification. Queue consumer uses SDK `handleCallback` with bounded retry policy.

- [ ] Write failing tests for duplicate delivery, wrong-org ID, stale review/reclassification, 429 defer with Retry-After, malformed AI output, three-attempt terminal error, and eventual progress after an expired lease.

```ts
await processClassification({ feedbackItemId: reviewedId, organizationId: orgId })
expect(classifyFeedback).not.toHaveBeenCalled()
expect((await db.feedbackItem.findUnique({ where: { id: reviewedId } }))?.status).toBe('REVIEWED')
```

- [ ] Run targeted tests; confirm each new behavior fails before code.
- [ ] Implement the consumer using `handleCallback`, `reserveClassification`, existing `classifyFeedback`, and conditional persistence. Adapt `persistClassification`/`markClassificationError` so updates are conditional on the current lease token and expected status; do not let an old Function write over a review or newer reclassification. Queue retry is not the source of truth for attempts; Neon is. Publish messages using SDK `send('feedback-classify', {feedbackItemId,organizationId}, {delaySeconds,idempotencyKey})`; use an attempt-specific idempotency key for legitimate retries.

```ts
export const POST = handleCallback(async (message: ClassifyMessage) => {
  await processClassification(message)
})
```

- [ ] Run targeted Jest, `npx tsc --noEmit`, and `npx eslint` on changed paths. Review `vercel.json` against official Queue trigger syntax and keep the consumer route inaccessible as ordinary public HTTP on Vercel.

## Task 3 — Manual/reclassify producers and daily repair

**Files:** Modify `app/api/feedback/route.ts`, `app/api/feedback/[id]/route.ts`; create `app/api/cron/classification/route.ts`; modify `vercel.json`; test `__tests__/unit/api-routes.test.ts` and `__tests__/unit/classification-dispatch.test.ts`.

**Interface:** Routes create/reset an item as `PENDING` then call `publishClassification`. Daily cron validates `CRON_SECRET`, finds `PENDING` or expired `CLASSIFYING` items, and republishes bounded ID-only messages. Failed publish leaves the item durably pending and returns a truthful queued/pending response, not a false classified claim.

- [ ] Write failing tests for manual publish, reclassification version invalidating an old lease, queue failure preserving a recoverable pending item, unauthorized cron, and repair of a publish gap.

```ts
expect(send).toHaveBeenCalledWith('feedback-classify', {
  feedbackItemId: itemId,
  organizationId: orgId,
}, expect.any(Object))
```

- [ ] Run targeted tests and confirm failure.
- [ ] Replace `getClassifyQueue()` calls on these two routes. Keep user authorization and existing response contracts unless a documented status change is needed. Add one daily cron entry; never use cron as the only prompt processing path. Include a bounded scan/publish batch and an expired-lease recovery rule.

```json
{"crons":[{"path":"/api/cron/classification","schedule":"0 2 * * *"}]}
```

- [ ] Run targeted Jest, `npx tsc --noEmit`, ESLint, and a local manual-submit/reclassify workflow against test services. Confirm `CRON_SECRET` is server-only; do not write its value to docs, logs, or Git.

## Task 4 — Preview go/no-go and documentation

**Files:** Modify `README.md`, `.env.example` only after separate approval for production-configuration/sensitive-file edits; add an E2E test to `__tests__/e2e/csv-upload.spec.ts` only if it can use a disposable account without production data. Otherwise create `__tests__/e2e/manual-classification.spec.ts`.

- [ ] Run `npm test -- --runInBand`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `git diff --check`, and review the entire diff.
- [ ] In an isolated Vercel preview with disposable Neon data, submit manual feedback and reclassify it, interrupt/retry a consumer, and send concurrent messages. Inspect Groq request times, usage headers, and Queue behavior to prove that Neon pacing stays below the account's actual limits. Do not proceed to production if this fails.
- [ ] Update deployment/readme claims: hosted processing is via Functions/Queues with a daily recovery cron, while Zendesk/Intercom remain deferred. Record measured preview latency and free-tier limitations without claiming production accuracy.
- [ ] Hand off exact verification and remaining risks. Stop before any production schema migration, push, or deployment; those remain separately approved cutover actions.

## References checked 2026-09-23

- https://vercel.com/docs/queues/sdk
- https://vercel.com/docs/queues
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://console.groq.com/docs/rate-limits
