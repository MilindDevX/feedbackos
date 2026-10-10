import { NextRequest, NextResponse } from 'next/server'
import { auth, type SessionUser } from '@/auth'
import { rateLimit } from '@/lib/rate-limit'
import { startCsvImport } from '@/lib/imports/routes'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, 'csv-import-start', 10, 3600)
  if (limited) return limited
  const session = await auth()
  const body = await request.json().catch(() => null)
  const result = await startCsvImport((session?.user as SessionUser | undefined) ?? null, body)
  return NextResponse.json(result.body, { status: result.status })
}
