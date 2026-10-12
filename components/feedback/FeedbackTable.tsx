'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Inbox, Search, X } from 'lucide-react'
import ThemeBadge from './ThemeBadge'
import StatusBadge from './StatusBadge'
import FeedbackSlideOver from './FeedbackSlideOver'
import { buttonClass, inputClass } from '@/components/ui/primitives'
import SentimentLegend from './SentimentLegend'
import { cn, formatSentiment, formatTheme, timeAgo } from '@/lib/utils'

interface FeedbackItem {
  id: string
  source: string
  rawText?: string
  submittedAt: string
  status: string
  classification?: {
    theme: string
    secondaryThemes?: string[]
    sentiment: string
    productArea?: string
    confidenceScore: number
    summary: string
  }
}

interface ListResult {
  base: string
  items: FeedbackItem[]
  total: number
  totalPages: number
}

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'NEEDS_REVIEW', label: 'Needs review' },
  { value: 'CLASSIFIED', label: 'Classified' },
  { value: 'REVIEWED', label: 'Reviewed' },
  { value: 'PENDING', label: 'Pending' },
]
const THEMES = ['BUG_PROBLEM', 'FEATURE_REQUEST', 'USABILITY_ISSUE', 'QUESTION_SUPPORT', 'PRAISE', 'OTHER']
const SENTIMENTS = ['POSITIVE', 'NEGATIVE', 'MIXED', 'NEUTRAL']
const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

interface FeedbackTableProps {
  embedded?: boolean
  pageSize?: number
  initialStatus?: string
}

export default function FeedbackTable({ embedded = false, pageSize = 20, initialStatus = '' }: FeedbackTableProps) {
  const [status, setStatus] = useState(initialStatus)
  const [theme, setTheme] = useState('')
  const [sentiment, setSentiment] = useState('')
  const [productArea, setProductArea] = useState('')
  const [period, setPeriod] = useState('')
  const [productAreas, setProductAreas] = useState<Array<{ name: string; count: number }>>([])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [refreshTick, setRefreshTick] = useState(0)
  const [result, setResult] = useState<ListResult | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const base = useMemo(() => new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(status && { status }),
    ...(theme && { theme }),
    ...(sentiment && { sentiment }),
    ...(productArea && { productArea }),
    ...(period && { withinDays: period }),
    ...(search && { search }),
  }).toString(), [page, pageSize, status, theme, sentiment, productArea, period, search])

  // Product areas come from this workspace's own data, so every choice returns results.
  useEffect(() => {
    if (embedded) return
    let cancelled = false
    fetch('/api/feedback/product-areas')
      .then((res) => res.json())
      .then((json) => { if (!cancelled) setProductAreas(json.data || []) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [embedded])


  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/feedback?${base}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return
        setResult({ base, items: json.data || [], total: json.meta?.total || 0, totalPages: json.meta?.totalPages || 1 })
      })
      .catch(() => { if (!cancelled) setResult({ base, items: [], total: 0, totalPages: 1 }) })
    return () => { cancelled = true }
  }, [base, refreshTick])

  // While anything on screen is still being classified, refresh quietly so results appear on their own.
  const waiting = result?.items.some((item) => item.status === 'PENDING' || item.status === 'CLASSIFYING') ?? false
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => setRefreshTick((tick) => tick + 1), 4000)
    return () => clearInterval(timer)
  }, [waiting])

  const loading = !result || result.base !== base
  const items = result?.items ?? []
  const total = result?.total ?? 0
  const totalPages = result?.totalPages ?? 1
  const hasFilters = Boolean(status || theme || sentiment || productArea || period || search)
  const clearFilters = () => {
    setStatus(''); setTheme(''); setSentiment(''); setProductArea(''); setPeriod(''); setSearchInput(''); setSearch(''); setPage(1)
  }
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div>
      {!embedded && (
        <div className="space-y-3 mb-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1" role="group" aria-label="Filter by status">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => { setStatus(tab.value); setPage(1) }}
                aria-pressed={status === tab.value}
                className={cn(
                  'h-8 px-3 rounded-md text-sm whitespace-nowrap transition-colors',
                  status === tab.value ? 'bg-ink text-canvas font-medium' : 'text-ink-2 hover:bg-hover hover:text-ink'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <SentimentLegend />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">Search feedback</span>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" aria-hidden="true" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search feedback text"
                maxLength={200}
                className={cn(inputClass, 'pl-9 h-9')}
              />
            </label>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {[
                { label: 'Theme', value: theme, set: setTheme, options: THEMES.map((t) => ({ value: t, label: formatTheme(t) })) },
                { label: 'Sentiment', value: sentiment, set: setSentiment, options: SENTIMENTS.map((t) => ({ value: t, label: formatSentiment(t) })) },
                { label: 'Product area', value: productArea, set: setProductArea, options: productAreas.map((a) => ({ value: a.name, label: `${a.name} (${a.count})` })) },
                { label: 'Any time', value: period, set: setPeriod, options: PERIODS, aria: 'Filter by period' },
              ].map(({ label, value, set, options, aria }) => (
                <select
                  key={label}
                  aria-label={aria ?? `Filter by ${label.toLowerCase()}`}
                  value={value}
                  onChange={(e) => { set(e.target.value); setPage(1) }}
                  className={cn(inputClass, 'h-9 py-0 sm:w-auto', value && 'border-accent text-accent')}
                >
                  <option value="">{label}</option>
                  {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ))}
            </div>
            {hasFilters && (
              <button onClick={clearFilters} className={buttonClass('ghost', 'md', 'self-start sm:self-auto')}>
                <X className="w-3.5 h-3.5" aria-hidden="true" /> Clear
              </button>
            )}
          </div>
        </div>
      )}

      <div className={cn(!embedded && 'rounded-xl border border-line bg-surface overflow-hidden')}>
        {loading ? (
          <ul aria-busy="true" aria-label="Loading feedback">
            {Array.from({ length: Math.min(pageSize, 6) }).map((_, i) => (
              <li key={i} className="px-4 sm:px-5 py-4 border-b border-line last:border-b-0 space-y-2">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-3 w-1/3" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Inbox className="w-8 h-8 mx-auto text-ink-3" aria-hidden="true" />
            <p className="mt-3 font-medium text-ink">{hasFilters ? 'Nothing matches these filters' : 'No feedback yet'}</p>
            <p className="mt-1 text-sm text-ink-3">
              {hasFilters ? 'Try a different status or clear the filters.' : 'Add a single item or import a CSV — classification starts on its own.'}
            </p>
            <div className="mt-5">
              {hasFilters
                ? <button onClick={clearFilters} className={buttonClass('secondary')}>Clear filters</button>
                : <Link href="/ingest" className={buttonClass('primary')}>Add feedback</Link>}
            </div>
          </div>
        ) : (
          <ul>
            {items.map((item, index) => {
              const c = item.classification
              return (
                <li key={item.id} className="border-b border-line last:border-b-0 rise-in" style={{ animationDelay: `${Math.min(index, 8) * 25}ms` }}>
                  <button
                    data-testid="feedback-row"
                    onClick={() => setSelectedId(item.id)}
                    className="w-full text-left px-4 sm:px-5 py-3.5 flex gap-3 hover:bg-hover focus-visible:bg-hover transition-colors"
                  >
                    <span className={cn('dot mt-1.5', `dot-${(c?.sentiment || 'neutral').toLowerCase()}`)} title={c ? formatSentiment(c.sentiment) : 'Not classified yet'} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-ink line-clamp-2">
                        {c?.summary || item.rawText?.slice(0, 140) || 'Waiting for classification…'}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                        {c && <ThemeBadge theme={c.theme} />}
                        {c?.secondaryThemes?.map((secondary) => <ThemeBadge key={secondary} theme={secondary} secondary />)}
                        {c?.productArea && <><span>{c.productArea}</span><span aria-hidden="true">·</span></>}
                        <span className="tabular">{timeAgo(item.submittedAt)}</span>
                        <span className="sm:hidden"><StatusBadge status={item.status} /></span>
                      </span>
                    </span>
                    <span className="hidden sm:block flex-shrink-0 pt-0.5"><StatusBadge status={item.status} /></span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {!embedded && !loading && total > 0 && (
          <div className="px-4 sm:px-5 py-3 border-t border-line flex items-center justify-between text-xs text-ink-3">
            <p className="tabular">{first}–{last} of {total.toLocaleString()}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Previous page" className={buttonClass('ghost', 'sm', 'px-2')}>
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} aria-label="Next page" className={buttonClass('ghost', 'sm', 'px-2')}>
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedId && (
        <FeedbackSlideOver
          item={{ id: selectedId }}
          onClose={() => setSelectedId(null)}
          onReviewed={() => setRefreshTick((tick) => tick + 1)}
        />
      )}
    </div>
  )
}
