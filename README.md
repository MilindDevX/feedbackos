# FeedbackOS — Customer Feedback Triage

FeedbackOS categorizes customer feedback by theme, sentiment and product area, then routes uncertain results to human review. AI output is parsed as JSON and validated with Zod. Synthetic evaluation fixtures do not establish production accuracy or measured time savings.

## Demo and release status

[Live demo](https://feedbackos.vercel.app). The demo dataset contains 48 feedback items. Local changes described below have not been deployed; hosted processing must pass the preview gate before production release.

## Classification architecture

Manual submissions and reclassification persist a PENDING FeedbackItem in PostgreSQL, then publish only its ID and organization ID to the feedback-classify Vercel Queue. The protected Function consumer validates the message, checks ownership/status, reserves provider capacity and a two-minute item lease, calls the classifier, and saves the result only while that lease is current. Reviewed items and newer reclassifications cannot be overwritten by an old result.

Neon owns the backlog, attempt count, retry time and provider budget. A failed Queue publication leaves the item pending and produces an honest pending API response. Retries are limited to three attempts; provider Retry-After delays apply across consumers. AI SDK retries are disabled. Failed or timed-out final attempts become CLASSIFICATION_ERROR.

The consumer is registered through queue/v2beta in [vercel.json](vercel.json), which makes it inaccessible as ordinary public HTTP on Vercel. An authenticated daily recovery cron at /api/cron/classification republishes up to 100 due items, manual feedback first, including expired leases. Queue delivery provides prompt processing; cron repairs missed wakeups and abandoned or stuck CSV imports. After each claim the consumer publishes a delayed watchdog wakeup (lease + 30 s), so a consumer that crashes mid-call is retried in about 2.5 minutes without relying on Queue redelivery (verified in an isolated preview). An invocation that finishes its own item keeps draining the oldest due items at the provider pace for up to 75 s, because paced Queue retries otherwise arrive in lockstep about once a minute.

The initial conservative budget is five requests/minute, 7,000 reserved tokens/minute, 1,000 requests/day and 200,000 reserved tokens/day; bulk CSV uses only the first 900 daily request slots. Reservation includes UTF-8 bytes of the complete system/user prompts, a framing allowance and 512 completion tokens; once the provider reports actual usage, the unused remainder is refunded to the same minute/day windows (a short item reserves ~3,800 tokens but uses ~900). Measured preview throughput is about four classifications per minute. Prompt text is truncated further when necessary; truncated or oversized requests require human review. Daily counters reset at UTC midnight. The token-counter migration conservatively exhausts the current day's allowance for an existing budget with prior requests, since its historical token reservations are unknown. Actual usage and provider reset behavior must still be verified against Groq telemetry. Different API keys share organization limits; independent deployments do not share this database counter. The original feedback stays in the database.

Dispatcher ownership and priority are explicit, not inferred from the original ingestion source: manual submissions and human-requested reclassifications are INTERACTIVE; CSV import rows are BULK and their wakeups are staggered 24 s apart. Unmarked integration work stays on its existing processing path. Bulk reservation yields to due interactive work. Human review atomically invalidates the lease, saves the correction and records its audit action. Queue retries use lease-specific generations and fit the SDK's visibility/expiry bounds; expired messages leave the durable backlog recoverable.

Redis remains required for dashboard caching, HTTP rate limiting and the remaining BullMQ paths. Zendesk and Intercom still require jobs/worker.ts; their hosted migration is deferred. CSV imports no longer use BullMQ or the worker.

## Setup

Requirements: Node.js 20.9+, PostgreSQL 14+, Redis 6+ and a Groq key. The repository uses Next.js 16, React 19 and Prisma 5.

Install with `pnpm install --frozen-lockfile`, copy .env.example to .env, and configure database, Redis, Groq, authentication, email and encryption values privately. Never commit .env. Set CRON_SECRET separately for each hosted environment. Queue authentication uses Vercel's environment identity.

For a new disposable/local database, run `npm run db:migrate` then `npm run db:seed`. Run the web app with `npm run dev:next`. Local Queue development requires a linked Vercel project and development identity through Vercel's documented development setup. An unlinked next dev session cannot publish Queue messages; the API saves feedback pending for recovery. `npm run dev` also starts the BullMQ worker for CSV/Zendesk/Intercom.

**Automated local testing (no real sign-in).** Start `next dev` with `LOCAL_TEST_MODE=1` against a disposable database. Then `http://localhost:<port>/api/test/login?next=/feedback` signs in a seeded `local-test@feedbackos.test` owner of a "Local Test Workspace", and classification messages are delivered in-process (no Vercel Queue; needs `GROQ_API_KEY`). Both switch off unless the flag is set, `NODE_ENV=development`, no `VERCEL`/`VERCEL_ENV` is present and the request host is loopback, so no deployment can enable them. CSV uploads still stop at the Blob step locally (no reachable callback).

## Ingestion and review

- Manual feedback: submit through Ingest. HTTP 202 means queued or durably pending, not classified.
- Review: accept, override or reclassify a result. Viewers cannot perform review actions.
- CSV: the browser reads headers locally, starts an import (`POST /api/feedback/imports`), then uploads directly to a **private** Vercel Blob store through an authenticated token endpoint (`/api/feedback/imports/blob`). Limits: 20 MiB and 2,000 data rows; over-limit or malformed files are rejected with zero rows inserted. Vercel Blob's signed completion callback validates and inserts rows idempotently, deletes the file, and queues row IDs. One live import per workspace (database partial unique index). `GET /api/feedback/imports/:id` reports that import's progress. 2,000 rows take roughly 14 hours on the free AI tier. Requires a private Blob store (`BLOB_READ_WRITE_TOKEN`) and a reachable callback URL, so end-to-end uploads cannot complete on localhost.
- Zendesk/Intercom: existing integration code is retained; hosted worker migration is deferred.

## Verification

Run `npm test -- --runInBand`, `npx tsc --noEmit`, `npm run lint` and `npm run build`.

Database integration tests run only when TEST_DATABASE_URL is set and exactly matches DATABASE_URL. Both must point to a disposable PostgreSQL database with migrations applied. Never use production. Consumer tests replace the external AI call while exercising real database state, leases and budgets.

Existing unrelated UI/auth lint findings are reported separately from changed-file checks. Builds need network access to fetch the Google font.

## Preview and production release

Follow [the concrete preview checklist](docs/serverless-classification-preview.md) with isolated database/environment values. Verify manual submission, reclassification, concurrent messages, retries, expired leases, cron recovery, HTTP protection and measured Groq pacing before production. Hobby cron runs daily and is scheduled automatically only for production deployments; invoke its endpoint explicitly during controlled preview verification.

Use `npm run build` for preview. Apply migrations explicitly to the disposable preview database. The `deploy:build` script includes prisma migrate deploy and must not be used against an inherited production connection. Vercel's ordinary build does not apply migrations.

The six-theme migration maps classifications/review history/alert rules from retired labels. Retired-theme CLASSIFIED, CLASSIFYING and REVIEWED items move to NEEDS_REVIEW. Retired-theme alert rules are disabled before remapping; review their broader meaning before reactivation.

Production requires the separately approved brief maintenance cutover: restore-test a fresh Neon snapshot, pause consumers, verify no work is in flight, apply migrations, deploy matching code and verify processing, review queue, alert rules and migration state. Old/new enum schemas are not mutually compatible. Snapshot restore requires separate approval because it can discard later writes.

Use rediss:// for production Redis. Manual classification requires no paid always-running service once the Queue path has passed preview and been released; platform quotas still apply.
