// ABOUTME: Limits that stop one caller from flooding sign-in email or one workspace from draining the shared AI quota.
// ABOUTME: All workspaces share one Groq daily quota, so each workspace gets a daily share of new feedback.
import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { hitRateLimit } from '@/lib/rate-limit'

export const MAGIC_LINKS_PER_EMAIL_PER_HOUR = 5
export const MAGIC_LINKS_PER_IP_PER_HOUR = 20
export const DEFAULT_WORKSPACE_DAILY_ITEMS = 500

// Hashed so Redis never holds raw email addresses.
export function magicLinkBucket(email: string): string {
  return `magic-link-email:${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}`
}

export function magicLinkEmailLimited(email: string): Promise<boolean> {
  return hitRateLimit(magicLinkBucket(email), MAGIC_LINKS_PER_EMAIL_PER_HOUR, 3600)
}

export function isMagicLinkSignIn(pathname: string): boolean {
  return pathname.endsWith('/signin/nodemailer')
}

export function workspaceDailyItemLimit(env: { WORKSPACE_DAILY_ITEM_LIMIT?: string } = { WORKSPACE_DAILY_ITEM_LIMIT: process.env.WORKSPACE_DAILY_ITEM_LIMIT }): number {
  const configured = Number(env.WORKSPACE_DAILY_ITEM_LIMIT)
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_WORKSPACE_DAILY_ITEMS
}

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

// Feedback ingested today (UTC), optionally ignoring one CSV import's own rows so a resumed import is not double-counted.
export function itemsIngestedToday(organizationId: string, now = new Date(), excludeCsvImportId?: string): Promise<number> {
  return db.feedbackItem.count({
    where: {
      organizationId,
      ingestedAt: { gte: startOfUtcDay(now) },
      ...(excludeCsvImportId && { OR: [{ csvImportId: null }, { csvImportId: { not: excludeCsvImportId } }] }),
    },
  })
}
