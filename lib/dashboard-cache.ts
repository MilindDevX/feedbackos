// ABOUTME: Versioned cache keys for dashboard aggregates, so any feedback change makes old entries unreachable at once.
import { redis } from '@/lib/redis'

const versionKey = (organizationId: string) => `dashboard:version:${organizationId}`

export async function dashboardCacheKey(organizationId: string, name: string): Promise<string> {
  let version: string | null = null
  try {
    version = await redis.get(versionKey(organizationId))
  } catch {
    // Redis down: the cache read will miss too, so any key works.
  }
  return `dashboard:${name}:${organizationId}:v${version ?? '0'}`
}

// Bumping the version beats deleting keys: summary entries vary by date window and cannot be listed cheaply.
export async function invalidateDashboard(organizationId: string): Promise<void> {
  try {
    await redis.incr(versionKey(organizationId))
  } catch {
    // Entries still expire on their own TTL.
  }
}
