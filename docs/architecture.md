# Architecture

How FeedbackOS turns a piece of customer feedback into a classified, reviewable item, and what keeps that process correct when things fail. For running and deploying it, see [operations.md](operations.md).

## Components

| Part | Role |
| --- | --- |
| Next.js app (Vercel Functions) | UI, API routes, authentication, CSV import endpoints |
| PostgreSQL (Neon) via Prisma | Source of truth: feedback, classifications, reviews, leases, AI budget, imports |
| Vercel Queue `feedback-classify` | Wakes the classifier; messages carry only an item ID and workspace ID |
| Classifier function `/api/queues/classify` | Claims an item, calls the model, saves the result |
| Groq (`openai/gpt-oss-120b`) | Returns a JSON classification, validated with Zod |
| Vercel Blob (private store) | Holds an uploaded CSV only while it is imported |
| Redis (Upstash) | Dashboard cache and rate-limit counters; the app keeps working if it is down |
| Vercel Cron (daily) | Re-queues stuck work, repairs imports, deletes expired sessions |

## Classification pipeline

1. **Save first.** A manual submission or re-classification is stored as `PENDING`. The API answers 202, which means saved and queued, not yet classified.
2. **Publish an ID.** Only `{ feedbackItemId, organizationId }` goes to the queue. If publishing fails, the item simply stays pending for recovery.
3. **Claim with a lease.** The consumer validates the message, checks the item still belongs to the workspace and is still pending, reserves AI capacity and takes a two-minute lease (`classificationLeaseToken`, `classificationLeaseUntil`).
4. **Watchdog.** Right after claiming, it publishes a delayed wake-up for lease + 30 seconds. If the function crashes mid-call, the watchdog finds the expired lease and retries, so recovery takes about 2.5 minutes instead of waiting for the daily cron.
5. **Classify.** The prompt asks for one JSON object: primary theme, up to two secondary themes, sentiment, product area (from the workspace's list), confidence, a summary of at most 15 words and a review flag. Long text is truncated; truncated items always go to review.
6. **Save only if still current.** The result is written in one transaction, and only while the lease is still held. A human review or a newer re-classification invalidates the lease, so an old result can never overwrite it.
7. **Route.** Confidence below 0.6, or the model's own review flag, sets `NEEDS_REVIEW`; otherwise `CLASSIFIED`. The workspace's dashboard cache version is bumped so figures update immediately.
8. **Drain.** An invocation that finished its own item keeps working through the oldest due items for up to 75 seconds, at the provider's pace. Without this, paced queue retries would arrive in lockstep about once a minute.

Failures retry at most three times, honouring the provider's `Retry-After`. The final failure marks the item `CLASSIFICATION_ERROR`.

### Mixed feedback

The actionable part is the primary theme: a problem, request or question outranks praise. Any other theme the item clearly contains goes into `secondaryThemes`, so "the UI is good but checkout needs work" is stored as *Feature request + Praise*. Mild praise next to a problem is `MIXED` sentiment, and the summary keeps both halves. Theme filters, dashboard counts, trends and exports all include secondary themes.

### AI budget

Groq's free tier allows 30 requests a minute, 1,000 a day, 8,000 tokens a minute and 200,000 tokens a day, shared by every workspace. FeedbackOS stays under that with its own stricter budget, tracked in one database row (`groq:gpt-oss-120b`): at most 5 requests and 7,000 reserved tokens a minute, 1,000 requests and 200,000 reserved tokens a day, and calls spaced at least 12 seconds apart (`lib/classification/dispatch.ts`).

- Each call reserves its prompt size plus 512 completion tokens. Once the provider reports actual usage, the unused part is refunded to the same windows. A short item reserves about 3,800 tokens but uses about 900.
- Work has two priorities. Manual items and re-classifications are `INTERACTIVE`. CSV rows are `BULK`, are spaced 24 seconds apart, may use only the first 900 daily requests, and yield to waiting interactive work.
- Daily counters reset at UTC midnight. Measured throughput is about four classifications a minute.

## CSV import

1. The browser reads only the header to suggest a column mapping.
2. `POST /api/feedback/imports` creates an `UPLOADING` import with a server-chosen private path. A partial unique index allows one live import per workspace.
3. The browser uploads directly to private Blob storage with a short-lived token from `/api/feedback/imports/blob`, bound to that import. Files are limited to 20 MiB.
4. Blob's signed completion callback validates the whole file first (at most 2,000 rows; malformed files insert nothing), then inserts rows idempotently by `(csvImportId, csvRowNumber)`, deletes the file and publishes staggered row IDs.
5. The page polls `GET /api/feedback/imports/:id` for progress. The import becomes `COMPLETED` when no row is pending.
6. The daily cron fails uploads abandoned for over an hour, resumes imports stuck mid-insert and closes finished ones.

## Access and limits

- **Sessions** are Auth.js database sessions, via Google or a magic link. A Google sign-in links to an existing account with the same verified email.
- **Workspaces.** Each person belongs to one workspace. Roles are `OWNER`, `ADMIN`, `MEMBER` and `VIEWER`; viewers can read but every write endpoint answers 403.
- **Rate limits.** Fixed-window Redis counters, per account on signed-in routes and per IP on public ones (`lib/rate-limit.ts`). Sign-in emails are limited to 5 per address and 20 per IP each hour. The limits fail open if Redis is down.
- **Daily item limit.** Each workspace may add 500 new items per UTC day (`WORKSPACE_DAILY_ITEM_LIMIT`), counted in the database, so it holds even without Redis.
- **Dashboard cache.** Keys include a per-workspace version number. Any classification, review, submission or import bumps it, so stale figures are never served.

## Public demo

`/api/demo` creates, on first use, an *Acme Analytics (demo)* workspace with 36 pre-classified sample items, then signs the visitor in for two hours as a shared `VIEWER`. Seeding and date refreshes run under a Postgres advisory lock, so simultaneous first visitors are safe. Sample dates slide forward whenever the newest item is more than six hours old, so the dashboard always looks current. The entry point is rate-limited per IP; set `DEMO_ENABLED=0` to turn it off.

## Data model (main tables)

- `Organization`, `OrganizationMember` (role), `User`, `Account`, `Session`
- `FeedbackItem`: text, source, status, dispatch kind, lease and retry fields, optional `csvImportId` and row number
- `Classification`: theme, `secondaryThemes`, sentiment, product area, confidence, summary, model, token counts
- `ReviewAction`: accept, override and re-classify history
- `ClassificationBudget`: provider minute and day windows
- `CsvImport`: state, counts, last error
- `IngestionSource`: Zendesk and Intercom configuration, with credentials encrypted

## Integrations (coming soon)

Zendesk sync and the Intercom webhook still use BullMQ jobs (`jobs/worker.ts`), and that worker is not deployed. Until they move onto the serverless pipeline, their endpoints answer 503 *coming soon* unless `INTEGRATIONS_ENABLED=1`. When the Intercom webhook is enabled, it rejects any request without a valid signature.
