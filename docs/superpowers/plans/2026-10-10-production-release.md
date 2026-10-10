# Production release: serverless classification + private CSV import

> Every step that writes to production (snapshot, migrations, merge to `main`, env changes) needs Milind's explicit approval. Branch: `feat/serverless-classification`. Rollback target: the production deployment live before the merge (`lho3yfakr` on 2026-10-11).

## What ships

- Code: Vercel Queue classifier (watchdog, drain, token refund), private-Blob CSV import, removal of the CSV worker path, dashboard/Redis fixes already on `main`.
- Migrations, in order: `20260922000000_refine_theme_taxonomy` (data remap: retired-theme CLASSIFIED/REVIEWED items reopen as NEEDS_REVIEW, retired-theme alert rules deactivate), four `2026092x/2026100x_classification_*` migrations, `20261010000000_csv_import`.
- Old and new theme enums are not mutually compatible, so the migration and the new code must go live together during a short maintenance window.

## Preconditions

1. **`CRON_SECRET` in Production** (Milind adds; agents do not enter secrets). Generate locally with `openssl rand -hex 32` and add it in Vercel → feedbackos → Settings → Environment Variables (Production, Sensitive). Without it the daily recovery/CSV-repair cron answers 503.
2. **Private Blob store for production**: create through Vercel Storage → Blob (private, iad1) connected to `feedbackos`, with "Add a read-write token env var" ticked so `BLOB_READ_WRITE_TOKEN` is injected. Secret-free; an agent can do this with approval.
3. **Read-only production check** (needs permission for production reads): `feedback_items` by status (expect no PENDING/CLASSIFYING), applied rows in `_prisma_migrations`, active `AlertRule` count. The last verified state (2026-09-23) was 48 items, one migration, no in-flight work.
4. Recommended hardening: mark `EMAIL_SERVER_PASSWORD` and `AUTH_SECRET` as Sensitive (they are currently plain Config variables).

## Cutover (≈10 minutes)

1. **Fresh Neon snapshot** of `main` (Neon console → Backup & Restore → create snapshot). Record its ID.
2. **Migrations run inside the production build** (`vercel.json` `buildCommand` → `scripts/vercel-build.ts`): `next build` first, then — only when `VERCEL_ENV=production` — `prisma migrate deploy` over Neon's direct endpoint (the `-pooler` host suffix is dropped; PgBouncer breaks Prisma's migration lock). Previews never migrate because they share the production database. A failed build changes nothing; a failed migration fails the deployment, so the old deployment keeps serving (if a later migration failed after earlier ones applied, restore the backup branch). Expect "7 migrations found … applied" in the build log.
3. **Merge and deploy**: fast-forward or merge `feat/serverless-classification` into `main` and push; Vercel deploys production automatically (~1 minute).
4. **Verify**: `/api/health` 200 (database ok, redis ok); signed-in manual feedback is classified within ~1 minute; dashboard loads; a small CSV import completes; Groq log shows matching calls; review counts and deactivated legacy alert rules match the migration's expectations.

## Rollback

- Code: `vercel rollback` to `lho3yfakr` (instant) — only safe before migrations or together with a snapshot restore, because the old code does not understand the new enums.
- Data: restore Neon backup branch `pre-release-backup-20261011` (or PITR within 6 h) (separate approval; discards writes made after it).

## Known follow-ups

Zendesk/Intercom still need the BullMQ worker (not deployed; production has no configured integrations). Dashboard shell has no mobile layout. Queue retention probes due 2026-10-10 21:14 UTC and 2026-10-16 19:14 UTC.

## Release log — 2026-10-11

- Neon backup branch `pre-release-backup-20261011` created from `main` before cutover.
- Private Blob store `feedbackos-blob` (iad1) connected to Production and Preview; `BLOB_READ_WRITE_TOKEN` is a Secret.
- `main` → `98be1b4`; production deployment `79c2rmnam` built, then applied 6 pending migrations (7 total, 0 unfinished).
- After release: `/api/health` 200 (database ok, redis ok); 48 items = 30 CLASSIFIED + 18 NEEDS_REVIEW, none PENDING/CLASSIFYING; 0 active alert rules; 0 CSV imports.
- Still open: `CRON_SECRET` (Milind), signed-in manual classification and small CSV import on production, 7-day retention probe (2026-10-16).
