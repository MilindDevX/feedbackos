import FeedbackTable from '@/components/feedback/FeedbackTable'
import { Metadata } from 'next'
import Link from 'next/link'
import { Upload, Plus } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Feedback — FeedbackOS',
  description: 'Browse and filter all customer feedback with AI classifications',
}

export default function FeedbackPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Feedback</h1>
          <p className="text-sm text-gray-500 mt-0.5">All ingested feedback with AI classifications</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/ingest"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload CSV
          </Link>
          <Link
            href="/ingest#manual"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white text-sm font-medium transition-all shadow-lg"
          >
            <Plus className="w-4 h-4" />
            Add Feedback
          </Link>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <FeedbackTable pageSize={20} />
      </div>
    </div>
  )
}
