# FeedbackOS taxonomy maintenance release

Date: 2026-09-23
Status: approved with three required clarifications on 2026-09-23

## Objective

Release the six intent-based feedback themes without silently losing classification retries, broadening historical alert rules, or leaving remapped items incorrectly marked reviewed. A short maintenance window is acceptable; a zero-downtime compatibility layer is out of scope.

## Verified starting state

- At the last remote check, GitHub `main` was at `440bdf5`; local `main` has the taxonomy commit `3b26af2` and release-corrections commit `a7c0e1d`. Neither has been pushed. Recheck remote and local state before release.
- The production database is on Neon's default `main` branch. Before migration it had one applied migration, 48 feedback items/classifications, no alert rules, and no `PENDING` or `CLASSIFYING` statuses. Sixteen classifications use retired themes: 5 `PRICING`, 6 `ONBOARDING`, 5 `PERFORMANCE`. Private project identifiers are recorded only in the Git-excluded project brain.
- A Neon snapshot was created from `main` and restore-tested on 2026-09-23: a throwaway branch had 48 feedback items, one applied migration, and 16 retired-theme classifications. Production `main` retained the same aggregate counts. The throwaway branch was deleted; the snapshot remains.
- Vercel and Render are accessible via CLI. The connected Render account has no FeedbackOS service, so the background worker's deployment location and controls remain unverified. Public login loaded in the in-app browser; `/api/health` timed out from the agent environment, which is inconclusive by itself.

## Changes before release

1. Keep the corrected `feedback_items` table name in the migration. Reopen `CLASSIFIED`, `CLASSIFYING`, and `REVIEWED` feedback whose retired theme is remapped; set `requiresHumanReview=true` for those classifications. Do not change unrelated statuses.
2. Deactivate alert rules targeting `PRICING`, `ONBOARDING`, or `PERFORMANCE` before remapping their theme. Preserve each rule's other settings for manual review and later reactivation. Production currently has zero rules, but the migration must remain safe for other databases.
3. Restore a bounded three-attempt classification job policy with exponential backoff. The worker already marks `CLASSIFICATION_ERROR` only after the final attempt; correct the queue's one-attempt setting and retain failed-job history for diagnosis.
4. Update the README with the maintenance sequence, the status/alert semantics, and what has and has not been verified. Do not claim production accuracy from the synthetic evaluation.

Use failing regression tests before each code change. Rehearse clean install and upgrade from a populated old-schema database, including a previously `REVIEWED` retired-theme item and an active retired-theme alert rule. Run Jest, TypeScript, lint, Prisma schema/drift checks, and a production build with disposable local configuration. The existing Playwright spec is discoverable but not an authenticated end-to-end pass.

## Cutover sequence

0. Completed on 2026-09-23: restored the pre-migration snapshot into a named throwaway branch, verified schema and aggregate counts, checked production `main` was unchanged, then deleted only the throwaway branch. No restore was finalized onto `main`.
1. Confirm the Neon snapshot is still available. Identify where the actual worker runs, or establish that it has never been deployed; inspect its build command and deployment controls. Check remote `main` has not advanced.
2. Pause the worker and any scheduled background consumers; confirm no items remain `CLASSIFYING` or `PENDING` before migration. Existing web traffic may encounter errors until the matching deployment is live, so treat this as a maintenance window rather than zero downtime.
3. Apply the tested Prisma migration to Neon `main` in a controlled step, then push the matching application commits to GitHub `main`. Wait for Vercel's production deployment and deploy/resume the matching worker version on its confirmed host.
4. Verify the deployed commit, Neon migration record, expected review counts, inactive legacy alert rules, worker startup/logs, and public health endpoint. Complete an authenticated upload-to-review browser check if a safe demo session is available; otherwise report it explicitly as unverified.

If any prerequisite fails, stop before pushing. If the cutover fails after migration, keep the worker paused and report the precise state. Restoring the Neon snapshot can discard post-snapshot writes and requires separate explicit approval; do not do it automatically.

## Acceptance

- The migrated schema matches Prisma and all six new theme values are usable.
- Retired-theme historical classifications remain present and require review; no active legacy rule silently broadens its trigger.
- Classification jobs retry transient failures within a bounded policy and mark an error only on final failure.
- Web and worker run matching release code, health and logs are checked, and any unverified browser workflow is reported rather than claimed.
- Private `brain/` remains Git-excluded; no secret or backup file is committed or pushed.
