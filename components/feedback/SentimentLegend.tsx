import { cn } from '@/lib/utils'

export const SENTIMENT_ORDER = ['POSITIVE', 'MIXED', 'NEUTRAL', 'NEGATIVE'] as const
const LABELS: Record<string, string> = { POSITIVE: 'Positive', MIXED: 'Mixed', NEUTRAL: 'Neutral', NEGATIVE: 'Negative' }

// Explains the coloured sentiment dots; with counts it doubles as the key for the dashboard's sentiment bar.
export default function SentimentLegend({ counts, className }: { counts?: Record<string, number>; className?: string }) {
  const total = counts ? SENTIMENT_ORDER.reduce((sum, key) => sum + (counts[key] || 0), 0) : 0
  return (
    <ul aria-label="Sentiment colours" className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3', className)}>
      {SENTIMENT_ORDER.map((key) => (
        <li key={key} className="inline-flex items-center gap-1.5">
          <span className={cn('dot', `dot-${key.toLowerCase()}`)} aria-hidden="true" />
          {LABELS[key]}
          {counts && total > 0 && <span className="tabular text-ink-2">{Math.round(((counts[key] || 0) / total) * 100)}%</span>}
        </li>
      ))}
    </ul>
  )
}
