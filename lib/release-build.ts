// ABOUTME: Decides what the Vercel build runs: migrations apply to production only, after the app builds.
// ABOUTME: Migrations use Neon's direct endpoint because the pooler (PgBouncer) breaks Prisma's migration lock.
import { withConnectTimeout } from '@/lib/db-url'

export type BuildStep = 'build' | 'migrate'

// Previews share the production database, so only a production build may change its schema.
// Building first means a failed build leaves the schema untouched for the running deployment.
export function buildSteps(env: { VERCEL_ENV?: string }): BuildStep[] {
  return env.VERCEL_ENV === 'production' ? ['build', 'migrate'] : ['build']
}

export function directDatabaseUrl(url: string | undefined): string {
  let parsed: URL
  try {
    parsed = new URL(url ?? '')
  } catch {
    throw new Error('DATABASE_URL is missing or malformed')
  }
  parsed.hostname = parsed.hostname.replace(/-pooler(?=\.)/, '')
  parsed.searchParams.delete('pgbouncer')
  return withConnectTimeout(parsed.toString()) as string
}
