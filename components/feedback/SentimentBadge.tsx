import { cn, formatSentiment } from '@/lib/utils'

export default function SentimentBadge({ sentiment, size = 'sm' }: { sentiment: string; size?: 'sm' | 'md' }) {
  return (
    <span className={cn('tag', `tag-${sentiment.toLowerCase()}`, size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm')}>
      <span className={cn('dot', `dot-${sentiment.toLowerCase()}`)} aria-hidden="true" />
      {formatSentiment(sentiment)}
    </span>
  )
}
