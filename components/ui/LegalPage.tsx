import Link from 'next/link'
import { Brand } from '@/components/ui/Brand'

export const CONTACT_EMAIL = 'feedbackos.web@gmail.com'

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto max-w-2xl px-5 h-16 flex items-center justify-between">
        <Link href="/login" aria-label="FeedbackOS home"><Brand /></Link>
        <nav className="flex gap-4 text-sm text-ink-3">
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-2xl px-5 pb-20 pt-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink-3">Last updated {updated}</p>
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink-2 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:mt-10 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-ink [&_strong]:font-medium">
          {children}
        </div>
      </main>
    </div>
  )
}
