# FeedbackOS no-worker CSV import

Date: 2026-09-23
Status: reviewed with required corrections; scheduling fallback requires confirmation before implementation

## Goal and scope

Make manual feedback and CSV imports classify on the hosted site without a paid, always-running worker. The first CSV release accepts files up to **20 MiB and 2,000 data rows**, with gradual classification and honest progress. Reclassification remains supported. Zendesk and Intercom are deferred. This design does not authorize pushing the existing taxonomy migration or changing production data.

## Current constraints

- Vercel Functions reject request bodies above 4.5 MB. The current page advertises 10 MB/500 rows, its API enforces 5 MiB/500 rows, and the worker that consumes its BullMQ jobs is not hosted.
- Groq's published free limit for `openai/gpt-oss-120b` is 30 requests/minute, 1,000 requests/day and 8,000 tokens/minute; actual account limits and token usage must be checked. A 2,000-row import may take multiple days, not minutes.
- Vercel Blob's direct client uploads can bypass the Function body cap. A **private** Blob store is required for customer feedback. Vercel Queues can invoke Functions, but documented push-consumer concurrency control must be verified in a preview environment before it is relied on for Groq pacing. Hobby Vercel Cron can run only once per day, so cron-only processing cannot meet the prompt-manual-feedback requirement.
- `lib/queue.ts` currently defines `CsvImportPayload` with full `rows[]`; `app/api/feedback/upload/route.ts` publishes those rows, and `jobs/worker.ts` consumes them. This is incompatible with the ID-only queue contract and must be removed, not preserved as a legacy route.

## Design

1. **Accept the file:** The ingest page checks extension and 20 MiB size before upload, reads only enough locally to show column choices, then uploads the file directly to a private Vercel Blob store. An authenticated, organization-scoped token endpoint rate-limits token issuance, limits accepted CSV content type/path, and binds the upload to a server-created import ID. Never put a Blob read/write credential in browser code. The server verifies the completed object's size, type, import ownership, and expected pathname; it rejects and deletes an oversized or otherwise invalid blob. Browser checks alone are never the limit enforcement. **The 20 MiB limit cannot become active until the direct Blob upload is wired and preview-tested.** Until then, retain the existing Function upload limits; do not merely raise `MAX_FILE_SIZE_BYTES` from 5 MiB or `MAX_ROW_COUNT` from 500. The existing upload route is replaced or disabled when the Blob path becomes active, and page copy changes only with that cutover.
2. **Persist the import:** Add a `CsvImport` Prisma model and migration. It has `id`, `organizationId`, `uploaderId`, `state`, `blobPathname`, `columnMapping` (validated JSON), `byteSize`, `totalRows`, `importedRows`, `invalidRows`, `lastError`, `createdAt`, `updatedAt`, and completion timestamps. `CsvImportState` is `UPLOADING`, `IMPORTING`, `PROCESSING`, `COMPLETED`, `FAILED`, or `REJECTED`. Add nullable `csvImportId` and `csvRowNumber` to `FeedbackItem`, with a unique pair so retrying a batch cannot duplicate a row. A raw SQL partial unique index on `CsvImport.organizationId` for `UPLOADING`, `IMPORTING`, and `PROCESSING` enforces one live import per organization across concurrent Functions; application checks alone are insufficient. Classification progress counts are derived from linked FeedbackItems rather than duplicated counters. Completion callbacks and retries are idempotent for the import ID. The server reads the private blob, validates CSV structure and all rows before writing any FeedbackItems, and records at most 2,000 data rows. Reject files exceeding 2,000 rows explicitly; do not silently truncate or report them as skipped. Row validation errors are counted and shown. Import persistence uses bounded database batches, not a queue payload containing CSV text or all rows. Delete the blob after successful durable import; retain it temporarily on recoverable failure with a bounded cleanup/retry policy. No CSV contents or private URL in logs.
3. **Classify gradually:** Remove `CsvImportPayload`, `getCsvQueue`, the `CSV_IMPORT` queue name, and the CSV worker handler; inspect any existing CSV queue backlog before retiring it. The new classify consumer is the only queue consumer for CSV classification. Queue messages contain only item IDs and organization IDs. The Function consumer rechecks ownership and current status, atomically claims work, then uses the existing classifier and final-attempt error semantics. Retries are bounded and idempotent; stale or duplicate deliveries cannot overwrite reviewed/reclassified items. Manual submissions and reclassification receive priority over bulk CSV work. A Neon-backed dispatch/lease and rate budget are authoritative for pacing and recovery, including `429`/`Retry-After`; queue concurrency limits, if verified, are an additional bound, not the sole protection. Neon is the durable backlog source; do not depend on a queue message surviving a multi-day import. Queue delivery wakes the classifier promptly; a once-daily Hobby cron scans Neon to repair missed publishes and abandoned imports. Cron alone is not a viable primary executor on Hobby for the promised responsiveness.
4. **Show truthful progress:** The upload UI separately shows upload, import, queued, classified, needs-review, and failed counts for its import ID. It does not call an organization-wide zero-pending state “done.” It explains that free-tier AI processing may take days and that closing the page will not cancel it. The UI and README agree on 20 MiB/2,000 rows and identify the free-tier caveat.

## Security and cost guardrails

- Authorize every token, completion, import-status, and queue-dispatch path server-side by organization. Treat filename, column mapping, MIME type, callback payload, and CSV text as untrusted. Use a server-generated opaque import ID/path and verify Blob callback authenticity through the SDK.
- Enforce the database-level one-live-import constraint, upload-token rate limits, 20 MiB object size, 2,000 rows, per-row text limit, and bounded AI dispatch. These prevent a free account or malicious uploader from exhausting storage, Functions, Groq, or Neon.
- Private Blob Hobby usage is included only within Vercel's published monthly limits. Check the project's current quota before preview and after test imports; free does not mean unlimited. Blob deletion must be observable and have a cleanup path for abandoned uploads.

## Alternative considered

Browser-side CSV parsing with chunked API requests would avoid Blob, but requires resumable chunk protocol, client/server parser parity, and more fragile recovery when the tab closes. Private Blob plus a durable import record is the simpler reliable route for a 20 MiB file. Sending the whole CSV through a Function is ruled out by the platform limit.

## Acceptance and release gates

- Given a valid CSV under both limits, when the user uploads and maps columns, then rows persist once, progress is scoped to that import, and classification continues after the tab closes.
- Given a file over 20 MiB or over 2,000 rows, when upload/import is attempted, then the user receives an explicit error and no partial or silently truncated import is reported as successful.
- Given duplicate Blob callbacks, queue deliveries, retries, or a Function interruption, then no duplicate FeedbackItems or stale classification overwrites occur; pending rows can resume.
- Given simultaneous manual feedback and a CSV import, manual feedback remains responsive within available free-tier capacity; CSV progress can be slow but never falsely complete.
- Tests follow red/green TDD for limits, parsing, authorization, the partial unique index, idempotency, retries, and import progress. Verify TypeScript, Jest, lint, build, and rendered desktop/mobile upload flow. Preview-test private upload, callback, bounded Groq pacing under concurrent queue delivery, and a file above 4.5 MB. **Hard go/no-go gate:** if the preview cannot keep Groq within its actual limits while delivering manual feedback promptly, stop before production cutover and revise the scheduler. Daily Hobby cron alone is not an acceptable fallback for that promise.
- Production migration/deployment remains a separately approved maintenance cutover with a fresh, restorable Neon snapshot and no automatic destructive restore.

## Primary references checked 2026-09-23

- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/vercel-blob/client-upload
- https://vercel.com/docs/vercel-blob/private-storage
- https://vercel.com/docs/vercel-blob/usage-and-pricing
- https://vercel.com/docs/queues
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://console.groq.com/docs/rate-limits
