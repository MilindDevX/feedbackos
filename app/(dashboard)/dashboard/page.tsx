'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, RefreshCw } from 'lucide-react'
import ThemeBreakdownChart from '@/components/dashboard/ThemeBreakdownChart'
import SentimentTrendChart from '@/components/dashboard/SentimentTrendChart'
import FeedbackTable from '@/components/feedback/FeedbackTable'
import { PageHeader, Panel, buttonClass } from '@/components/ui/primitives'
import { cn, formatTheme } from '@/lib/utils'

interface Summary {
  total: number
  windowDays: number | null
  needsReview: number
  negativePercent: number
  byTheme: Record<string, number>
  bySentiment: Record<string, number>
  topProductAreas: Array<{ name: string; count: number }>
  byStatus: Record<string, number>
  topTheme: string | null
}

interface TrendData {
  weeks: string[]
  topThemes: string[]
  chartData: Array<Record<string, number | string>>
  themeTotals: Record<string, number>
}

const SENTIMENT_ORDER = ['POSITIVE', 'MIXED', 'NEUTRAL', 'NEGATIVE'] as const

function SentimentSplit({ counts }: { counts: Record<string, number> }) {
  const total = SENTIMENT_ORDER.reduce((sum, key) => sum + (counts[key] || 0), 0)
  if (total === 0) return <div className="h-1.5 rounded-full bg-sunken" />
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden gap-px" role="img" aria-label={SENTIMENT_ORDER.map((k) => `${k.toLowerCase()} ${counts[k] || 0}`).join(', ')}>
      {SENTIMENT_ORDER.map((key) => counts[key] ? (
        <span key={key} className={cn('dot h-full rounded-none', `dot-${key.toLowerCase()}`)} style={{ width: `${(counts[key] / total) * 100}%` }} />
      ) : null)}
    </div>
  )
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [trends, setTrends] = useState<TrendData | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetch('/api/dashboard/summary'), fetch('/api/dashboard/trends')])
      .then(([a, b]) => Promise.all([a.json(), b.json()]))
      .then(([sumJson, trendJson]) => {
        if (cancelled) return
        setSummary(sumJson.data)
        setTrends(trendJson.data)
      })
      .finally(() => { if (!cancelled) setRefreshing(false) })
    return () => { cancelled = true }
  }, [tick])

  const loading = !summary
  const period = summary?.windowDays ? `last ${summary.windowDays} days` : 'selected range'

  const stats = [
    { label: 'Feedback', value: summary?.total.toLocaleString() ?? '—', note: period },
    { label: 'Negative', value: `${summary?.negativePercent ?? 0}%`, note: <SentimentSplit counts={summary?.bySentiment ?? {}} /> },
    { label: 'Top theme', value: summary?.topTheme ? formatTheme(summary.topTheme) : '—', note: 'most mentioned' },
  ]

  return (
    <>
      <PageHeader
        title="Overview"
        description={`What customers told you in the ${period}.`}
        actions={
          <button onClick={() => { setRefreshing(true); setTick((t) => t + 1) }} disabled={refreshing} className={buttonClass('ghost')}>
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      <Panel className="grid grid-cols-2 lg:grid-cols-4 divide-line [&>*]:border-line">
        {stats.map((stat, i) => (
          <div key={stat.label} className={cn('p-4 sm:p-5 min-w-0', i > 0 && 'border-l', i === 2 && 'border-l-0 border-t lg:border-l lg:border-t-0')}>
            <p className="text-xs text-ink-3">{stat.label}</p>
            {loading ? <div className="skeleton h-8 w-20 mt-2" /> : (
              <p className="mt-1 font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink truncate tabular">{stat.value}</p>
            )}
            <div className="mt-2 text-xs text-ink-3">{stat.note}</div>
          </div>
        ))}
        <Link
          href="/feedback?status=NEEDS_REVIEW"
          className={cn('group p-4 sm:p-5 border-l border-t lg:border-t-0 min-w-0 transition-colors hover:bg-hover rounded-br-xl lg:rounded-r-xl', (summary?.needsReview ?? 0) > 0 && 'bg-accent-soft/60')}
        >
          <p className="text-xs text-ink-3">Needs review</p>
          {loading ? <div className="skeleton h-8 w-12 mt-2" /> : (
            <p className="mt-1 font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink tabular">{summary?.needsReview ?? 0}</p>
          )}
          <p className="mt-2 text-xs text-accent inline-flex items-center gap-1">
            Open queue <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </p>
        </Link>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Panel className="p-5 lg:col-span-2">
          <h2 className="font-display text-base font-semibold text-ink">Themes</h2>
          <p className="text-xs text-ink-3 mt-0.5 mb-5">Items mentioning each theme, {period}</p>
          {loading ? <div className="space-y-4">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-7" />)}</div> : <ThemeBreakdownChart data={summary?.byTheme ?? {}} />}
        </Panel>
        <Panel className="p-5 lg:col-span-3">
          <h2 className="font-display text-base font-semibold text-ink">Trend</h2>
          <p className="text-xs text-ink-3 mt-0.5 mb-4">Top themes per week, last 12 weeks</p>
          {loading ? <div className="skeleton h-60" /> : <SentimentTrendChart trends={trends} />}
        </Panel>
      </div>

      <Panel className="mt-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-ink">Latest feedback</h2>
          <Link href="/feedback" className="text-sm text-accent hover:text-accent-hover inline-flex items-center gap-1">
            View all <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
        <FeedbackTable embedded pageSize={8} />
      </Panel>
    </>
  )
}
