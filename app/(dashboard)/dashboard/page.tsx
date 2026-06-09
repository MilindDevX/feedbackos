'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, AlertTriangle, TrendingDown, Tag, RefreshCw } from 'lucide-react'
import ThemeBreakdownChart from '@/components/dashboard/ThemeBreakdownChart'
import SentimentTrendChart from '@/components/dashboard/SentimentTrendChart'
import FeedbackTable from '@/components/feedback/FeedbackTable'
import KPICard from '@/components/dashboard/KPICard'
import { formatTheme } from '@/lib/utils'

interface Summary {
  total: number
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

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [trends, setTrends] = useState<TrendData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const [sumRes, trendRes] = await Promise.all([
        fetch('/api/dashboard/summary'),
        fetch('/api/dashboard/trends'),
      ])
      const [sumJson, trendJson] = await Promise.all([sumRes.json(), trendRes.json()])
      setSummary(sumJson.data)
      setTrends(trendJson.data)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const kpiCards = [
    {
      id: 'total',
      title: 'Total Feedback',
      value: summary?.total ?? 0,
      icon: MessageSquare,
      color: 'brand' as const,
      description: 'All-time feedback items',
    },
    {
      id: 'negative',
      title: 'Negative Sentiment',
      value: `${summary?.negativePercent ?? 0}%`,
      icon: TrendingDown,
      color: 'red' as const,
      description: 'Of classified feedback',
    },
    {
      id: 'review',
      title: 'Needs Review',
      value: summary?.needsReview ?? 0,
      icon: AlertTriangle,
      color: 'amber' as const,
      description: 'Low-confidence items',
    },
    {
      id: 'top-theme',
      title: 'Top Theme',
      value: summary?.topTheme ? formatTheme(summary.topTheme) : '—',
      icon: Tag,
      color: 'purple' as const,
      description: 'Most frequent category',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Your feedback intelligence at a glance</p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((card) =>
          loading ? (
            <div key={card.id} className="glass-card p-5 h-28 skeleton" />
          ) : (
            <KPICard key={card.id} {...card} loading={false} />
          )
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {loading ? (
          <>
            <div className="glass-card p-5 h-80 skeleton" />
            <div className="glass-card p-5 h-80 skeleton" />
          </>
        ) : (
          <>
            <ThemeBreakdownChart data={summary?.byTheme || {}} />
            <SentimentTrendChart trends={trends} />
          </>
        )}
      </div>

      {/* Feedback table */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Recent Feedback</h2>
          <a href="/feedback" className="text-sm text-brand-400 hover:text-brand-300 transition-colors">
            View all →
          </a>
        </div>
        <FeedbackTable embedded pageSize={10} />
      </div>
    </div>
  )
}
