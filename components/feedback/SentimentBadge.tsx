import { cn, formatSentiment } from '@/lib/utils'

interface SentimentBadgeProps {
  sentiment: string
  size?: 'sm' | 'md'
}

export default function SentimentBadge({ sentiment, size = 'sm' }: SentimentBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full font-medium',
      `badge-${sentiment.toLowerCase()}`,
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
    )}>
      {formatSentiment(sentiment)}
    </span>
  )
}
