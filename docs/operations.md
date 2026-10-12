# Operations

Running, deploying and checking FeedbackOS. For how it works inside, see [architecture.md](architecture.md).

## Environments

| Environment | Where | Database | Notes |
| --- | --- | --- | --- |
| Production | Vercel project `feedbackos`, branch `main` | Neon `main` branch | Deploys on every push to `main` |
| Preview | Same Vercel project, any other branch | **Same production database** | Builds never migrate; don't test schema changes here |
| Local | `next dev` | Your own PostgreSQL | `LOCAL_TEST_MODE=1` for signed-in automated tests |

All variables are listed and explained in [`.env.example`](../.env.example). Mark secrets as *Sensitive* in Vercel.

## Deploying

1. Merge to `main` and push. Vercel builds with `pnpm exec tsx scripts/vercel-build.ts` (set in `vercel.json`).
2. The build runs `next build` first, then, **only when `VERCEL_ENV=production`**, `prisma migrate deploy`. It uses Neon's direct (non-pooled) host, because the pooler breaks Prisma's migration lock. A failed build changes nothing; a failed migration fails the deployment, so the previous one keeps serving.
3. Check that a new **Production** row appears in `vercel ls feedbackos`, then run the checks below.

> **Push `main` first.** If the same commit was already built as a preview from a branch push, Vercel may skip the production build for that commit. Pushing `main` before the branch (or a new commit) avoids it.

### After every deploy

```bash
curl -s https://feedbackos.vercel.app/api/health                                    # {"status":"healthy", database ok, redis ok}
curl -s -o /dev/null -w '%{http_code}\n' https://feedbackos.vercel.app/api/export     # 401 when signed out
curl -s -o /dev/null -w '%{http_code}\n' https://feedbackos.vercel.app/api/test/login # 404 (local-only route)
```

Then open the [demo](https://feedbackos.vercel.app/api/demo) and submit one item in a real workspace to confirm it gets classified.

## Rolling back

- **Code only:** `vercel rollback <deployment>` or *Promote* an earlier deployment in Vercel. This is safe while the database schema still matches that code.
- **Code and data:** restore a Neon backup branch or use point-in-time recovery (6 hours on the free plan). Old code cannot read newer enum values, so restore the database together with the code.
- Before risky migrations, create a Neon backup branch (Branches → Create branch from `main`).

## Scheduled and background work

| Job | Schedule | Purpose |
| --- | --- | --- |
| `/api/cron/classification` | Daily, 02:00 UTC (Vercel Hobby) | Re-queues stuck or unpublished items, repairs CSV imports, deletes expired sessions. Needs `CRON_SECRET`; answers 503 without it. |
| Queue consumer `/api/queues/classify` | On each message | Classification; reachable only through Vercel's signed queue trigger |
| Watchdog messages | Lease + 30 s after each claim | Retries a classification whose function crashed |

## Switches

| Variable | Default | Effect |
| --- | --- | --- |
| `WORKSPACE_DAILY_ITEM_LIMIT` | 500 | New items each workspace may add per UTC day |
| `DEMO_ENABLED` | on | `0` turns off the public demo |
| `INTEGRATIONS_ENABLED` | off | `1` shows the Zendesk/Intercom setup and enables their endpoints (needs the BullMQ worker) |
| `LOCAL_TEST_MODE` | off | Local only: test sign-in and in-process queue |

## Local testing recipe

```bash
redis-server --port 6390 --daemonize yes --save '' --appendonly no
LOCAL_TEST_MODE=1 REDIS_URL=redis://localhost:6390 DATABASE_URL=postgresql://localhost/feedbackos_test \
  NEXTAUTH_URL=http://localhost:3123 AUTH_TRUST_HOST=true npx next dev --webpack -p 3123
# then open http://localhost:3123/api/test/login?next=/dashboard
```

CSV uploads stop at the Blob step locally, because Vercel Blob cannot call back to your machine. The import pipeline is covered by integration tests instead.

## Evaluation runs

The free Groq tier allows 8,000 tokens a minute, so pace runs with `--delay-ms=9000`:

```bash
node --env-file=.env --import tsx scripts/evaluate-classification.ts --split=dev --delay-ms=9000 --output=evaluation/dev-<date>.json
node --env-file=.env --import tsx scripts/evaluate-classification.ts --dataset=evaluation/feedbackos-mixed-v0.1.csv --split=mixed --delay-ms=9000
```

The `test` split is locked; it needs `--allow-locked-test` and should only be used for a final, approved measurement. Evaluation calls share the production AI quota.

## Known limits

- Free tiers: large imports classify gradually (about 2,000 rows in 14 hours); Neon may take a few seconds to wake an idle database (connections allow 30 seconds).
- Sign-in emails go through Gmail SMTP, which caps sending at roughly 500 a day. Use a transactional provider and your own domain before heavy public use.
- Zendesk and Intercom are *coming soon* until their jobs move off BullMQ.

## History

Release evidence and plans live in [`docs/serverless-classification-preview.md`](serverless-classification-preview.md) and [`docs/superpowers/`](superpowers/). They are point-in-time records, not current instructions.
