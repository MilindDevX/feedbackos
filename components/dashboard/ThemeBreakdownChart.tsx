import Link from 'next/link'
import { cn, formatTheme } from '@/lib/utils'

// Plain bars instead of a chart library: labels stay readable at any width and follow the theme tokens.
export default function ThemeBreakdownChart({ data }: { data: Record<string, number> }) {
  const rows = Object.entries(data).sort(([, a], [, b]) => b - a)
  const max = Math.max(1, ...rows.map(([, count]) => count))

  if (rows.length === 0) {
    return (
      <div className="h-48 flex flex-col items-center justify-center text-center">
        <p className="text-sm text-ink-2">No classified feedback in this period.</p>
        <Link href="/ingest" className="mt-1 text-sm text-accent hover:text-accent-hover">Add feedback</Link>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {rows.map(([theme, count]) => (
        <li key={theme}>
          <Link href={`/feedback`} className="group block">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink group-hover:text-accent transition-colors">{formatTheme(theme)}</span>
              <span className="tabular text-ink-2">{count.toLocaleString()}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-sunken overflow-hidden">
              <div className={cn('h-full rounded-full', `tag-${theme.toLowerCase()}`)} style={{ width: `${(count / max) * 100}%`, background: 'oklch(64% 0.13 var(--h))' }} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
