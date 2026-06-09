import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { successResponse, unauthorized, serverError } from '@/lib/api-response'
import type { SessionUser } from '@/auth'
import { Theme, Sentiment, SourceType, FeedbackStatus } from '@prisma/client'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const user = session.user as SessionUser
  if (!user.organizationId) return unauthorized()

  const url = new URL(req.url)
  const theme = url.searchParams.get('theme') as Theme | null
  const sentiment = url.searchParams.get('sentiment') as Sentiment | null
  const source = url.searchParams.get('source') as SourceType | null
  const dateFrom = url.searchParams.get('dateFrom')
  const dateTo = url.searchParams.get('dateTo')

  try {
    const items = await db.feedbackItem.findMany({
      where: {
        organizationId: user.organizationId,
        ...(source && { source }),
        ...(dateFrom && { submittedAt: { gte: new Date(dateFrom) } }),
        ...(dateTo && { submittedAt: { lte: new Date(dateTo) } }),
        ...(theme && { classification: { theme } }),
        ...(sentiment && { classification: { sentiment } }),
      },
      include: { classification: true },
      orderBy: { submittedAt: 'desc' },
      take: 10000,
    })

    const headers = ['id', 'source', 'submitted_at', 'status', 'theme', 'sentiment', 'product_area', 'confidence', 'summary', 'raw_text']
    const rows = items.map((item) => [
      item.id,
      item.source,
      item.submittedAt.toISOString(),
      item.status,
      item.classification?.theme || '',
      item.classification?.sentiment || '',
      item.classification?.productArea || '',
      item.classification?.confidenceScore?.toFixed(2) || '',
      `"${(item.classification?.summary || '').replace(/"/g, '""')}"`,
      `"${item.rawText.replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    ])

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="feedback-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  } catch (err) {
    console.error('[GET /api/export]', err)
    return serverError()
  }
}
