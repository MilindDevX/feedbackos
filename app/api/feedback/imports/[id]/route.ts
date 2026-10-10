import { NextRequest, NextResponse } from 'next/server'
import { auth, type SessionUser } from '@/auth'
import { getCsvImportStatus } from '@/lib/imports/routes'

export const runtime = 'nodejs'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params
  const result = await getCsvImportStatus((session?.user as SessionUser | undefined) ?? null, id)
  return NextResponse.json(result.body, { status: result.status })
}
