import { Metadata } from 'next'
import { MessagesSquare, Headset } from 'lucide-react'
import { PageHeader, Panel } from '@/components/ui/primitives'
import { integrationsEnabled } from '@/lib/features'
import IntegrationsClient from './IntegrationsClient'

export const metadata: Metadata = { title: 'Integrations — FeedbackOS' }

const upcoming = [
  { name: 'Zendesk', icon: Headset, text: 'Pull support tickets on a schedule and classify them with the rest of your feedback.' },
  { name: 'Intercom', icon: MessagesSquare, text: 'Receive new conversations in real time through a signed webhook.' },
]

export default function IntegrationsPage() {
  if (integrationsEnabled()) return <IntegrationsClient />
  return (
    <div className="max-w-2xl">
      <PageHeader title="Integrations" description="Connect support tools so new conversations arrive and get classified automatically." />
      <div className="grid gap-4 sm:grid-cols-2">
        {upcoming.map(({ name, icon: Icon, text }) => (
          <Panel key={name} className="p-5">
            <div className="flex items-center justify-between">
              <Icon className="w-5 h-5 text-ink-3" aria-hidden="true" />
              <span className="tag tag-pending px-2 py-0.5 text-xs">Coming soon</span>
            </div>
            <h2 className="mt-4 font-display text-base font-semibold text-ink">{name}</h2>
            <p className="mt-1 text-sm text-ink-3">{text}</p>
          </Panel>
        ))}
      </div>
      <p className="mt-6 text-sm text-ink-3">
        Until then, import a CSV export from your support tool on the Ingest page. It is classified the same way.
      </p>
    </div>
  )
}
