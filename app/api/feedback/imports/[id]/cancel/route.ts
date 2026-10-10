import { NextRequest, NextResponse } from 'next/server'
import { auth, type SessionUser } from '@/auth'
import { cancelCsvImport } from '@/lib/imports/routes'

export const runtime = 'nodejs'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const { id } = await params
  const result = await cancelCsvImport((session?.user as SessionUser | undefined) ?? null, id)
  return NextResponse.json(result.body, { status: result.status })
}
