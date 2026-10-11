// ABOUTME: Shared query building and CSV escaping for the feedback list and export endpoints.
import type { Prisma, Sentiment, Theme } from '@prisma/client'

// All classification conditions go into one object; separate spreads would overwrite each other.
export function classificationFilter(filters: {
  theme?: Theme | null
  sentiment?: Sentiment | null
  productArea?: string | null
}): Prisma.FeedbackItemWhereInput['classification'] {
  const where: Prisma.ClassificationWhereInput = {
    ...(filters.theme && { theme: filters.theme }),
    ...(filters.sentiment && { sentiment: filters.sentiment }),
    ...(filters.productArea && { productArea: filters.productArea }),
  }
  return Object.keys(where).length > 0 ? { is: where } : undefined
}

export function submittedAtFilter(dateFrom?: string | null, dateTo?: string | null): Prisma.DateTimeFilter | undefined {
  if (!dateFrom && !dateTo) return undefined
  return {
    ...(dateFrom && { gte: new Date(dateFrom) }),
    ...(dateTo && { lte: new Date(dateTo) }),
  }
}

// Quotes a CSV cell and neutralises spreadsheet formulas (=, +, -, @, tab, CR) in customer-supplied text.
export function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
}
