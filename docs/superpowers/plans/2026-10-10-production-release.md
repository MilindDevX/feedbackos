# Production release: serverless classification + private CSV import

> Every step that writes to production (snapshot, migrations, merge to `main`, env changes) needs Milind's explicit approval. Branch: `feat/serverless-classification`. Current production deployment: `4ryz4ek1e` (rollback target).

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
2. **Apply migrations** with a direct (non-pooled) connection, from Milind's terminal so no agent handles the URL:
   `DATABASE_URL="<Neon direct connection string>" npx prisma migrate deploy`
   Expect "7 migrations found … applied". If it fails, stop: production code still runs against the old schema only if no migration applied; otherwise restore the snapshot (separate approval, discards later writes).
3. **Merge and deploy**: fast-forward or merge `feat/serverless-classification` into `main` and push; Vercel deploys production automatically (~1 minute).
4. **Verify**: `/api/health` 200 (database ok, redis ok); signed-in manual feedback is classified within ~1 minute; dashboard loads; a small CSV import completes; Groq log shows matching calls; review counts and deactivated legacy alert rules match the migration's expectations.

## Rollback

- Code: `vercel rollback` to `4ryz4ek1e` (instant) — only safe before migrations or together with a snapshot restore, because the old code does not understand the new enums.
- Data: restore the pre-release snapshot (separate approval; discards writes made after it).

## Known follow-ups

Zendesk/Intercom still need the BullMQ worker (not deployed; production has no configured integrations). Dashboard shell has no mobile layout. Queue retention probes due 2026-10-10 21:14 UTC and 2026-10-16 19:14 UTC.
