'use client'

import { useEffect, useState } from 'react'
import { X, CheckCircle, Edit3, RefreshCw, Loader2, ExternalLink, AlertCircle } from 'lucide-react'
import ThemeBadge from './ThemeBadge'
import SentimentBadge from './SentimentBadge'
import StatusBadge from './StatusBadge'
import { confidenceColor, formatSource, timeAgo } from '@/lib/utils'

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

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-gray-900 border-l border-gray-800 z-50 flex flex-col slide-over">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-base font-semibold text-white">Feedback Detail</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading ? (
            <div className="space-y-4">
              {[120, 200, 80, 100].map((h, i) => (
                <div key={i} className="skeleton rounded-lg" style={{ height: h }} />
              ))}
            </div>
          ) : !detail ? (
            <div className="text-center py-12">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-gray-400">Failed to load feedback details</p>
            </div>
          ) : (
            <>
              {/* Meta */}
              <div className="flex flex-wrap gap-2 items-center">
                <StatusBadge status={detail.status} />
                <span className="text-gray-500 text-xs">{formatSource(detail.source)}</span>
                <span className="text-gray-600 text-xs">·</span>
                <span className="text-gray-500 text-xs">{timeAgo(detail.submittedAt)}</span>
                {detail.submitterEmail && (
                  <>
                    <span className="text-gray-600 text-xs">·</span>
                    <span className="text-gray-500 text-xs">{detail.submitterEmail}</span>
                  </>
                )}
              </div>

              {/* Classification */}
              {detail.classification && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <ThemeBadge theme={detail.classification.theme} size="md" />
                    <SentimentBadge sentiment={detail.classification.sentiment} size="md" />
                    {detail.classification.productArea && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-800 text-gray-300">
                        {detail.classification.productArea}
                      </span>
                    )}
                  </div>

                  {/* Summary */}
                  <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">AI Summary</p>
                    <p className="text-gray-200 text-sm">{detail.classification.summary}</p>
                  </div>

                  {/* Confidence */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">Confidence</span>
                        <span className={`text-xs font-bold ${confidenceColor(detail.classification.confidenceScore)}`}>
                          {(detail.classification.confidenceScore * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-800">
                        <div
                          className={`h-full rounded-full transition-all ${
                            detail.classification.confidenceScore >= 0.8 ? 'bg-green-500' :
                            detail.classification.confidenceScore >= 0.6 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${detail.classification.confidenceScore * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-600">{detail.classification.modelUsed}</p>
                      <p className="text-xs text-gray-600">
                        {(detail.classification.promptTokens + detail.classification.completionTokens).toLocaleString()} tokens
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Raw text */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Raw Feedback</p>
                <div className="p-4 rounded-lg bg-gray-950 border border-gray-800 text-gray-300 text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {detail.rawText}
                </div>
              </div>

              {/* Review actions */}
              {detail.reviewActions && detail.reviewActions.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Review History</p>
                  <div className="space-y-2">
                    {detail.reviewActions.map((action) => (
                      <div key={action.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/50">
                        <div className="w-6 h-6 rounded-full bg-brand-900/50 flex items-center justify-center text-xs text-brand-400 flex-shrink-0">
                          {action.reviewer.name?.[0] || action.reviewer.email[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-300">{action.reviewer.name || action.reviewer.email}</span>
                            <span className="text-xs text-gray-600">{timeAgo(action.reviewedAt)}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {action.action === 'ACCEPTED' && 'Accepted AI classification'}
                            {action.action === 'OVERRIDDEN' && `Changed to ${action.newTheme} · ${action.newSentiment}`}
                            {action.action === 'RECLASSIFIED' && 'Triggered re-classification'}
                          </p>
                          {action.note && <p className="text-xs text-gray-400 mt-1 italic">"{action.note}"</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Action footer */}
        {!loading && detail && ['NEEDS_REVIEW', 'CLASSIFIED'].includes(detail.status) && (
          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-800 flex gap-3">
            <button
              onClick={() => handleAction('ACCEPTED')}
              disabled={actionLoading !== null}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {actionLoading === 'ACCEPTED' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Accept
            </button>
            <button
              onClick={() => handleAction('RECLASSIFIED')}
              disabled={actionLoading !== null}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {actionLoading === 'RECLASSIFIED' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Re-classify
            </button>
          </div>
        )}
      </div>
    </>
  )
}
