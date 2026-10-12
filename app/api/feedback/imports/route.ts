import { NextRequest, NextResponse } from 'next/server'
import { auth, type SessionUser } from '@/auth'
import { rateLimit, rateLimitBy } from '@/lib/rate-limit'
import { startCsvImport } from '@/lib/imports/routes'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, 'csv-import-start', 10, 3600)
  if (limited) return limited
  const session = await auth()
  const user = (session?.user as SessionUser | undefined) ?? null
  if (user?.id) {
    const userLimited = await rateLimitBy('csv-import-start-user', user.id, 10, 3600)
    if (userLimited) return userLimited
  }
  const body = await request.json().catch(() => null)
  const result = await startCsvImport(user, body)
  return NextResponse.json(result.body, { status: result.status })
}
