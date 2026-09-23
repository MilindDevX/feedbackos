# FeedbackOS taxonomy maintenance release implementation plan

> **For agentic workers:** Follow the approved spec and use test-driven development. This plan is executed inline in the current task; private `brain/` is never staged.

**Goal:** Ship six-theme classification with correct historical review semantics and safe bounded retries, then perform a verified maintenance cutover.

**Architecture:** Keep the one-step PostgreSQL enum migration and coordinate web/worker downtime. Add two SQL data-preservation guards and restore the existing BullMQ retry pattern; do not add a compatibility layer or new dependency.

**Tech Stack:** Prisma 5 SQL migrations, PostgreSQL/Neon, BullMQ 5, Jest, Next.js, Vercel, Render.

**Spec:** `docs/superpowers/specs/2026-09-23-taxonomy-maintenance-release-design.md`

## Global constraints

- No production migration or GitHub push before the snapshot restore test, local tests/build, Render service inspection, and confirmed maintenance order.
- Do not print or commit credentials, contact data, feedback text, snapshot contents, or project `brain/`.
- Do not restore the snapshot onto production `main`; any production rollback needs separate explicit approval.
- Preserve unrelated working-tree changes and stage exact files only after `git status`.

### Task 1: Prove the Neon recovery point

**Files:** Modify `docs/superpowers/specs/2026-09-23-taxonomy-maintenance-release-design.md` only to record verified outcome; update private `brain/current-focus.md` separately.

**Interfaces:** Consumes the pre-migration Neon snapshot identified in the private project brain; produces verified disposable restored-branch pre-migration count evidence.

- [x] **Step 1: Inspect** the recorded snapshot and branch list; resolve the exact source and avoid a branch-name collision.
- [x] **Step 2: Restore** the snapshot to a named disposable branch without `--finalize` or `--target-branch main`; record the returned branch ID privately.
- [x] **Step 3: Verify** the restored branch's `feedback_items` and `_prisma_migrations` counts. Expected: 48 feedback items and one applied migration. Query production `main` again to confirm the same counts and old `Theme` labels remain.
- [x] **Step 4: Clean up** only the returned disposable branch ID after verification; verify the snapshot still exists. If deletion is not safely supported, leave the branch and report it rather than guessing.

### Task 2: Preserve review and alert behavior through migration

**Files:** Modify `prisma/migrations/20260922000000_refine_theme_taxonomy/migration.sql`, `README.md`; create a disposable PostgreSQL fixture outside the repo for behavior checks.

**Interfaces:** Consumes the existing `0_init` migration and old enum values; produces migrated rows that match `prisma/schema.prisma` and preserves review intent.

- [x] **Step 1: Red test.** On a disposable PostgreSQL database, apply `prisma/migrations/0_init/migration.sql`, then insert the following fixture with `psql -v ON_ERROR_STOP=1`:

```sql
INSERT INTO "Organization" ("id", "name", "slug", "updatedAt")
VALUES ('org-test', 'Test', 'test', now());
INSERT INTO feedback_items ("id", "organizationId", "source", "rawText", "submittedAt", "status")
VALUES ('f-reviewed', 'org-test', 'MANUAL', 'sample', now(), 'REVIEWED'),
       ('f-classified', 'org-test', 'MANUAL', 'sample', now(), 'CLASSIFIED'),
       ('f-unaffected', 'org-test', 'MANUAL', 'sample', now(), 'CLASSIFIED');
INSERT INTO "Classification" ("id", "feedbackId", "theme", "sentiment", "confidenceScore", "summary", "modelUsed", "promptTokens", "completionTokens", "rawLlmResponse")
VALUES ('c-reviewed', 'f-reviewed', 'PRICING', 'NEUTRAL', 0.9, 'sample', 'fixture', 1, 1, '{}'::jsonb),
       ('c-classified', 'f-classified', 'ONBOARDING', 'NEUTRAL', 0.9, 'sample', 'fixture', 1, 1, '{}'::jsonb),
       ('c-unaffected', 'f-unaffected', 'PRAISE', 'POSITIVE', 0.9, 'sample', 'fixture', 1, 1, '{}'::jsonb);
INSERT INTO "AlertRule" ("id", "organizationId", "name", "theme", "threshold", "emailRecipients")
VALUES ('a-retired', 'org-test', 'pricing', 'PRICING', 1, ARRAY[]::text[]),
       ('a-unaffected', 'org-test', 'praise', 'PRAISE', 1, ARRAY[]::text[]);
```

Run the current taxonomy migration and query the two affected rows. Expected failure: `f-reviewed` remains `REVIEWED` and `a-retired` remains active; `f-unaffected` and `a-unaffected` establish unchanged behavior.
- [x] **Step 2: Minimal SQL.** Add `REVIEWED` to the existing status `IN` list. Before the `AlertRule.theme` enum cast, add:

```sql
UPDATE "AlertRule"
SET "isActive" = false
WHERE "theme" IN ('PRICING', 'ONBOARDING', 'PERFORMANCE')
  AND "isActive" = true;
```

- [x] **Step 3: Green test.** Recreate the disposable old-schema database; apply the corrected migration. Assert retired-theme `CLASSIFIED` and `REVIEWED` rows become `NEEDS_REVIEW`, all their classifications have `requiresHumanReview=true`, and retired-theme alert rules are inactive after remapping. Assert unaffected items/rules stay unchanged. Run `prisma migrate diff` against `prisma/schema.prisma` and expect no schema difference. Existing `CLASSIFYING` mapping was covered in the prior rehearsal but should be rechecked before release.
- [x] **Step 4: Document** that legacy alert rules are disabled pending review and historical reviewed feedback reopens; keep the maintenance and backup warning accurate.

### Task 3: Retry transient classification failures

**Files:** Modify `lib/queue.ts`; create `__tests__/unit/classification-queue.test.ts` (or add to an existing unit test if it exercises the real queue options).

**Interfaces:** `getClassifyQueue()` must return a BullMQ queue whose default job options attempt classification three times with exponential backoff. The existing worker final-attempt guard remains unchanged.

- [x] **Step 1: Red test.** Instantiate `getClassifyQueue()` with BullMQ and the Redis connection factory mocked at their external boundaries and inspect the queue's default job options. Assert `attempts` is `3` and backoff is `{ type: 'exponential', delay: 2000 }`; current code fails on `attempts: 1`.
- [x] **Step 2: Minimal change.** Match the existing Zendesk queue's three-attempt exponential backoff in the classification queue; do not add a retry abstraction.
- [x] **Step 3: Green test.** Run the new unit test and full Jest suite. Inspect `jobs/worker.ts` to confirm `markClassificationError` still executes only on the final attempt. The targeted test passed, followed by 60/60 Jest tests.

### Task 4: Release preflight and maintenance cutover

**Files:** Review and commit only scoped code/tests/docs; update private `brain/current-focus.md` after each actual release state change.

- [x] **Step 1: Verify** `pnpm test --runInBand`, `pnpm exec tsc --noEmit`, targeted ESLint, `pnpm exec prisma validate` with disposable URL, `pnpm build` with disposable environment values, and `git diff --check`. These checks passed, the scoped staged diff was reviewed, and local commit `a7c0e1d` was created. Browser workflow remains unverified.
- [ ] **Step 2: Confirm worker hosting.** The connected Render account has no FeedbackOS service. GitHub `main` remains at the pre-release commit and the tested Neon snapshot still exists. Determine whether the worker runs elsewhere or was never deployed, then inspect its controls or agree a safe provisioning path. Stop before production writes or push until this is resolved.
- [ ] **Step 3: Cut over** only after all preconditions: pause worker/scheduled consumers, confirm no `PENDING`/`CLASSIFYING` rows, run the rehearsed Prisma migration on Neon `main`, push the matching commits, deploy/resume the matching worker, and wait for Vercel production deployment. Do not treat a command success alone as workflow verification.
- [ ] **Step 4: Verify** deployed commit, migration record, review counts, disabled legacy rules, worker logs, public health, and authenticated browser upload-to-review if a safe demo session exists. Record exact gaps. Do not auto-restore production snapshot on failure.
