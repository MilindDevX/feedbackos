import { NextRequest, NextResponse } from 'next/server'
import { findRecoverableClassifications } from '@/lib/classification/dispatch'
import { publishClassification } from '@/lib/classification/publish'
import { privateCsvBlob } from '@/lib/imports/blob'
import { repairCsvImports } from '@/lib/imports/csv'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Cron not configured' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  // CSV repair runs first so resumed imports' rows are found below; its failure must not block recovery.
  try {
    await repairCsvImports(now, privateCsvBlob)
  } catch (error) {
    console.error('[cron] CSV import repair failed', error)
  }
  const work = await findRecoverableClassifications(now, 100)
  const results = await Promise.allSettled(work.map((message) => publishClassification(message, 0, now.getTime())))
  const failed = results.filter((result) => result.status === 'rejected').length
  return NextResponse.json({ published: results.length - failed, failed }, { status: failed ? 503 : 200 })
}
