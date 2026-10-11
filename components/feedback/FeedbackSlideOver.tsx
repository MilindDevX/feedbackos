'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Check, RefreshCw, Loader2, AlertCircle } from 'lucide-react'
import ThemeBadge from './ThemeBadge'
import SentimentBadge from './SentimentBadge'
import StatusBadge from './StatusBadge'
import { buttonClass } from '@/components/ui/primitives'
import { cn, formatSource, timeAgo } from '@/lib/utils'

interface FeedbackDetail {
  id: string
  source: string
  rawText: string
  submittedAt: string
  status: string
  submitterEmail?: string
  submitterName?: string
  classification?: {
    theme: string
    secondaryThemes?: string[]
    sentiment: string
    productArea?: string
    confidenceScore: number
    summary: string
    requiresHumanReview: boolean
    modelUsed: string
    promptTokens: number
    completionTokens: number
    classifiedAt: string
  }
  reviewActions?: Array<{
    id: string
    action: string
    reviewedAt: string
    reviewer: { name?: string; email: string; image?: string }
    note?: string
    newTheme?: string
    newSentiment?: string
  }>
}

interface FeedbackSlideOverProps {
  item: { id: string }
  onClose: () => void
  onReviewed: () => void
}

export default function FeedbackSlideOver({ item, onClose, onReviewed }: FeedbackSlideOverProps) {
  const [detail, setDetail] = useState<FeedbackDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchDetail = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/feedback/${item.id}`)
        const json = await res.json()
        setDetail(json.data)
      } finally {
        setLoading(false)
      }
    }
    fetchDetail()
  }, [item.id])

  // Move focus into the panel when it opens and give it back to the row when it closes.
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => opener?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleAction = async (action: 'ACCEPTED' | 'RECLASSIFIED') => {
    setActionLoading(action)
    setError('')
    try {
      const res = await fetch(`/api/feedback/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const json = await res.json()
        setError(json.error || 'Action failed')
        return
      }
      onReviewed()
      onClose()
    } finally {
      setActionLoading(null)
    }
  }

  const confidence = detail?.classification?.confidenceScore ?? 0
  const confidenceTone = confidence >= 0.8 ? 'bg-success' : confidence >= 0.6 ? 'bg-warning' : 'bg-danger'

  // Portal to <body>: an ancestor's backdrop-filter or transform would otherwise become the containing
  // block for these fixed elements and clip the panel.
  return createPortal(
    <>
      <div className="fixed inset-0 bg-[oklch(18%_0.02_275/0.4)] z-40 fade-in" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-detail-title"
        className="fixed inset-y-0 right-0 w-full sm:max-w-lg bg-surface sm:border-l border-line shadow-raised z-50 flex flex-col slide-over"
      >
        <div className="flex items-center justify-between h-14 px-5 border-b border-line">
          <h2 id="feedback-detail-title" className="font-display text-base font-semibold text-ink">Feedback</h2>
          <button ref={closeRef} onClick={onClose} aria-label="Close feedback detail" className="w-9 h-9 -mr-2 rounded-md flex items-center justify-center text-ink-2 hover:text-ink hover:bg-hover transition-colors">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {loading ? (
            <div className="space-y-4">
              {[60, 140, 40, 120].map((h, i) => <div key={i} className="skeleton" style={{ height: h }} />)}
            </div>
          ) : !detail ? (
            <div className="text-center py-12">
              <AlertCircle className="w-7 h-7 text-danger mx-auto mb-2" aria-hidden="true" />
              <p className="text-ink-2">This feedback could not be loaded.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                <StatusBadge status={detail.status} />
                <span>{formatSource(detail.source)}</span>
                <span aria-hidden="true">·</span>
                <span>{timeAgo(detail.submittedAt)}</span>
                {detail.submitterEmail && <><span aria-hidden="true">·</span><span className="truncate">{detail.submitterEmail}</span></>}
              </div>

              <blockquote className="font-display text-lg leading-snug text-ink whitespace-pre-wrap max-h-72 overflow-y-auto">
                {detail.rawText}
              </blockquote>

              {detail.classification && (
                <div className="rounded-lg bg-sunken p-4 space-y-4">
                  <p className="text-sm text-ink-2">{detail.classification.summary}</p>
                  <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-2.5 text-sm items-center">
                    <dt className="text-ink-3">Theme</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      <ThemeBadge theme={detail.classification.theme} />
                      {detail.classification.secondaryThemes?.map((theme) => <ThemeBadge key={theme} theme={theme} secondary />)}
                    </dd>
                    <dt className="text-ink-3">Sentiment</dt>
                    <dd><SentimentBadge sentiment={detail.classification.sentiment} /></dd>
                    {detail.classification.productArea && <><dt className="text-ink-3">Product area</dt><dd className="text-ink">{detail.classification.productArea}</dd></>}
                    <dt className="text-ink-3">Confidence</dt>
                    <dd className="flex items-center gap-2.5">
                      <span className="h-1.5 w-24 rounded-full bg-line overflow-hidden" aria-hidden="true">
                        <span className={cn('block h-full rounded-full', confidenceTone)} style={{ width: `${confidence * 100}%` }} />
                      </span>
                      <span className="tabular text-ink">{(confidence * 100).toFixed(0)}%</span>
                    </dd>
                  </dl>
                  <p className="text-xs text-ink-3">
                    {detail.classification.modelUsed} · {(detail.classification.promptTokens + detail.classification.completionTokens).toLocaleString()} tokens
                  </p>
                </div>
              )}

              {detail.reviewActions && detail.reviewActions.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-ink-3 mb-2">History</h3>
                  <ol className="space-y-3">
                    {detail.reviewActions.map((action) => (
                      <li key={action.id} className="flex items-start gap-3 text-sm">
                        <span className="w-6 h-6 rounded-full bg-accent-soft text-accent flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          {(action.reviewer.name?.[0] || action.reviewer.email[0]).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="text-ink">
                            <span className="font-medium">{action.reviewer.name || action.reviewer.email}</span>{' '}
                            <span className="text-ink-2">
                              {action.action === 'ACCEPTED' && 'accepted the classification'}
                              {action.action === 'OVERRIDDEN' && `changed it to ${action.newTheme} · ${action.newSentiment}`}
                              {action.action === 'RECLASSIFIED' && 'asked for re-classification'}
                            </span>
                          </p>
                          <p className="text-xs text-ink-3">{timeAgo(action.reviewedAt)}</p>
                          {action.note && <p className="text-xs text-ink-2 mt-1 italic">&ldquo;{action.note}&rdquo;</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            </>
          )}
        </div>

        {!loading && detail && ['NEEDS_REVIEW', 'CLASSIFIED'].includes(detail.status) && (
          <div className="flex-shrink-0 px-5 py-4 border-t border-line flex gap-2">
            <button onClick={() => handleAction('ACCEPTED')} disabled={actionLoading !== null} className={buttonClass('primary', 'md', 'flex-1')}>
              {actionLoading === 'ACCEPTED' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
              Accept
            </button>
            <button onClick={() => handleAction('RECLASSIFIED')} disabled={actionLoading !== null} className={buttonClass('secondary', 'md', 'flex-1')}>
              {actionLoading === 'RECLASSIFIED' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-4 h-4" aria-hidden="true" />}
              Re-classify
            </button>
          </div>
        )}
      </div>
    </>,
    document.body
  )
}
