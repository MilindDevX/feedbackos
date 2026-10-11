import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { unauthorized, serverError, validationError } from '@/lib/api-response'
import { classificationFilter, csvCell, submittedAtFilter } from '@/lib/feedback-filters'
import { z } from 'zod'
import type { SessionUser } from '@/auth'
import { Theme, Sentiment, SourceType } from '@prisma/client'

const validDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date')
const exportQuerySchema = z.object({
  theme: z.nativeEnum(Theme).optional(),
  sentiment: z.nativeEnum(Sentiment).optional(),
  source: z.nativeEnum(SourceType).optional(),
  dateFrom: validDate.optional(),
  dateTo: validDate.optional(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return unauthorized()
  const user = session.user as SessionUser
  if (!user.organizationId) return unauthorized()

  const parsed = exportQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return validationError(parsed.error.issues[0].message)
  const { theme, sentiment, source, dateFrom, dateTo } = parsed.data

  try {
    const items = await db.feedbackItem.findMany({
      where: {
        organizationId: user.organizationId,
        ...(source && { source }),
        submittedAt: submittedAtFilter(dateFrom, dateTo),
        classification: classificationFilter({ theme, sentiment }),
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
      item.classification?.summary || '',
      item.rawText,
    ].map(csvCell))

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
