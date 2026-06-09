'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, AlertTriangle, MessageSquare, Filter, X } from 'lucide-react'
import ThemeBadge from './ThemeBadge'
import SentimentBadge from './SentimentBadge'
import StatusBadge from './StatusBadge'
import FeedbackSlideOver from './FeedbackSlideOver'
import { formatSource, timeAgo } from '@/lib/utils'

interface FeedbackItem {
  id: string
  source: string
  rawText: string
  submittedAt: string
  status: string
  classification?: {
    theme: string
    sentiment: string
    productArea?: string
    confidenceScore: number
    summary: string
  }
}

interface FilterState {
  theme: string
  sentiment: string
  source: string
  status: string
}

interface FeedbackTableProps {
  embedded?: boolean
  pageSize?: number
}

export default function FeedbackTable({ embedded = false, pageSize = 20 }: FeedbackTableProps) {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedItem, setSelectedItem] = useState<FeedbackItem | null>(null)
  const [filters, setFilters] = useState<FilterState>({ theme: '', sentiment: '', source: '', status: '' })
  const [showFilters, setShowFilters] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...(filters.theme && { theme: filters.theme }),
        ...(filters.sentiment && { sentiment: filters.sentiment }),
        ...(filters.source && { source: filters.source }),
        ...(filters.status && { status: filters.status }),
      })
      const res = await fetch(`/api/feedback?${params}`)
      const json = await res.json()
      setItems(json.data || [])
      setTotal(json.meta?.total || 0)
      setTotalPages(json.meta?.totalPages || 1)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, filters])

  useEffect(() => { fetchItems() }, [fetchItems])

  const clearFilters = () => {
    setFilters({ theme: '', sentiment: '', source: '', status: '' })
    setPage(1)
  }
  const hasFilters = Object.values(filters).some(Boolean)

  const skeletonRows = Array.from({ length: pageSize > 10 ? 10 : pageSize })

  return (
    <div className="space-y-3">
      {/* Filter bar — only shown on full feedback page */}
      {!embedded && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              showFilters ? 'bg-brand-600/20 text-brand-400 border border-brand-600/30' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-brand-400 ml-0.5" />}
          </button>

          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors">
              <X className="w-3 h-3" /> Clear
            </button>
          )}

          {showFilters && (
            <div className="w-full flex flex-wrap gap-2 mt-1">
              {[
                { key: 'theme', label: 'Theme', options: ['BUG', 'FEATURE_REQUEST', 'PRICING', 'ONBOARDING', 'PERFORMANCE', 'PRAISE', 'OTHER'] },
                { key: 'sentiment', label: 'Sentiment', options: ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED'] },
                { key: 'source', label: 'Source', options: ['ZENDESK', 'INTERCOM', 'CSV', 'MANUAL', 'API'] },
                { key: 'status', label: 'Status', options: ['PENDING', 'CLASSIFIED', 'NEEDS_REVIEW', 'REVIEWED', 'CLASSIFICATION_ERROR'] },
              ].map(({ key, label, options }) => (
                <select
                  key={key}
                  value={filters[key as keyof FilterState]}
                  onChange={(e) => { setFilters(f => ({ ...f, [key]: e.target.value })); setPage(1) }}
                  className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">All {label}s</option>
                  {options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                </select>
              ))}
            </div>
          )}

          <div className="ml-auto text-xs text-gray-500">
            {total > 0 && `${total} item${total !== 1 ? 's' : ''}`}
          </div>
        </div>
      )}

      {/* Table */}
      <div className={embedded ? '' : 'glass-card overflow-hidden'}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Summary</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Theme</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Sentiment</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Product Area</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Source</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider hidden xl:table-cell">Date</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {loading ? (
                skeletonRows.map((_, i) => (
                  <tr key={i}>
                    {[120, 80, 70, 90, 60, 60, 80].map((w, j) => (
                      <td key={j} className="px-4 py-4 hidden-last">
                        <div className="skeleton h-4 rounded" style={{ width: `${w}px` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
                        <MessageSquare className="w-6 h-6 text-gray-600" />
                      </div>
                      <div>
                        <p className="text-gray-400 font-medium">No feedback found</p>
                        <p className="text-gray-600 text-xs mt-1">
                          {hasFilters ? 'Try adjusting your filters' : 'Upload your first batch of feedback to get started'}
                        </p>
                      </div>
                      {!hasFilters && (
                        <a href="/ingest" className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm transition-colors mt-1">
                          Add Feedback →
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="hover:bg-gray-800/30 cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-3.5 max-w-xs">
                      <p className="text-gray-200 text-sm line-clamp-2 group-hover:text-white transition-colors">
                        {item.classification?.summary || item.rawText?.slice(0, 100) || 'Processing...'}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      {item.classification?.theme ? (
                        <ThemeBadge theme={item.classification.theme} />
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      {item.classification?.sentiment ? (
                        <SentimentBadge sentiment={item.classification.sentiment} />
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <span className="text-gray-400 text-xs">{item.classification?.productArea || '—'}</span>
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <span className="text-gray-500 text-xs">{formatSource(item.source)}</span>
                    </td>
                    <td className="px-4 py-3.5 hidden xl:table-cell">
                      <span className="text-gray-500 text-xs">{timeAgo(item.submittedAt)}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={item.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!embedded && totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-30 text-gray-400 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-30 text-gray-400 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-over panel */}
      {selectedItem && (
        <FeedbackSlideOver
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onReviewed={fetchItems}
        />
      )}
    </div>
  )
}
