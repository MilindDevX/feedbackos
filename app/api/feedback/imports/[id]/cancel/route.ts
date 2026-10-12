import { NextRequest, NextResponse } from 'next/server'
import { auth, type SessionUser } from '@/auth'
import { rateLimitBy } from '@/lib/rate-limit'
import { cancelCsvImport } from '@/lib/imports/routes'

export const runtime = 'nodejs'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const user = (session?.user as SessionUser | undefined) ?? null
  if (user?.id) {
    const limited = await rateLimitBy('csv-import-cancel', user.id, 20, 3600)
    if (limited) return limited
  }
  const { id } = await params
  const result = await cancelCsvImport(user, id)
  return NextResponse.json(result.body, { status: result.status })
}
