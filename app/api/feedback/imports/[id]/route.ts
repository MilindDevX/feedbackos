import { NextRequest, NextResponse } from 'next/server'
import { auth, type SessionUser } from '@/auth'
import { rateLimitBy } from '@/lib/rate-limit'
import { getCsvImportStatus } from '@/lib/imports/routes'

export const runtime = 'nodejs'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = (session?.user as SessionUser | undefined) ?? null
  if (user?.id) {
    // The ingest page polls every 5 seconds; this leaves room for a few open tabs.
    const limited = await rateLimitBy('csv-import-status', user.id, 60)
    if (limited) return limited
  }
  const { id } = await params
  const result = await getCsvImportStatus(user, id)
  return NextResponse.json(result.body, { status: result.status })
}
