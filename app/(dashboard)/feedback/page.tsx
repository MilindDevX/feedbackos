import FeedbackTable from '@/components/feedback/FeedbackTable'
import { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Upload } from 'lucide-react'
import { PageHeader, buttonClass } from '@/components/ui/primitives'

export const metadata: Metadata = {
  title: 'Feedback — FeedbackOS',
  description: 'Browse and filter all customer feedback with AI classifications',
}

const STATUSES = ['NEEDS_REVIEW', 'CLASSIFIED', 'REVIEWED', 'PENDING']

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  return (
    <>
      <PageHeader
        title="Feedback"
        description="Every item, classified by theme and sentiment. Open one to review it."
        actions={<>
          <Link href="/ingest" className={buttonClass('secondary')}><Upload className="w-4 h-4" aria-hidden="true" />Import CSV</Link>
          <Link href="/ingest#manual" className={buttonClass('primary')}><Plus className="w-4 h-4" aria-hidden="true" />Add feedback</Link>
        </>}
      />
      <FeedbackTable pageSize={20} initialStatus={status && STATUSES.includes(status) ? status : ''} />
    </>
  )
}
