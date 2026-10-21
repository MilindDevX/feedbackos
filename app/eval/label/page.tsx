import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { isLocalHost, localTestMode } from '@/lib/local-test-mode'
import LabelForm from './LabelForm'

export const metadata = { title: 'Label golden set — FeedbackOS (local)' }

// Local-only tool for building the evaluation golden set; it does not exist on any deployment.
export default async function LabelPage() {
  if (!localTestMode() || !isLocalHost((await headers()).get('host'))) notFound()
  return <LabelForm />
}
