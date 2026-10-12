'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { Mail, ArrowRight, Loader2 } from 'lucide-react'
import { Brand } from '@/components/ui/Brand'
import { buttonClass, inputClass } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

export default function LoginForm({ initialError = '' }: { initialError?: string }) {
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [loading, setLoading] = useState<'google' | 'email' | null>(null)
  const [error, setError] = useState(initialError)

  const handleGoogleSignIn = async () => {
    setLoading('google')
    setError('')
    await signIn('google', { callbackUrl: '/dashboard' })
  }

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading('email')
    setError('')
    try {
      const result = await signIn('nodemailer', {
        email,
        redirect: false,
        callbackUrl: '/dashboard',
      })
      if (result?.error) {
        setError('We couldn\'t send the sign-in email right now. Please try again in a moment.')
      } else {
        setEmailSent(true)
      }
    } catch {
      // A server or network failure used to leave the page silent; say so instead.
      setError('We couldn\'t send the sign-in email right now. Please try again in a moment.')
    } finally {
      setLoading(null)
    }
  }

  const examples = [
    { text: 'The new filters are great, but please let me save a filter combination.', tags: [['feature_request', 'Feature request'], ['praise', '+ Praise'], ['mixed', 'Mixed']] },
    { text: 'CSV export cuts off rows after 1,000 every single time.', tags: [['bug_problem', 'Bug'], ['negative', 'Negative']] },
    { text: 'The AI summaries are spot on and save me an hour every day.', tags: [['praise', 'Praise'], ['positive', 'Positive']] },
  ]

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.1fr_1fr] bg-canvas">
      <aside aria-label="About FeedbackOS" className="hidden lg:flex flex-col justify-between p-12 xl:p-16 bg-sunken border-r border-line">
        <Brand subtitle="Feedback triage" />

        <div className="max-w-lg">
          <h1 className="font-display text-4xl xl:text-5xl font-semibold tracking-tight leading-[1.05] text-ink">
            Every customer message, read and sorted for you.
          </h1>
          <p className="mt-5 text-lg text-ink-2 leading-relaxed">
            FeedbackOS tags each piece of feedback by theme, sentiment and product area, and keeps the praise that hides inside complaints.
          </p>

          <ul className="mt-10 space-y-3" aria-label="Examples of classified feedback">
            {examples.map((example, i) => (
              <li key={example.text} className="rise-in rounded-lg border border-line bg-surface p-4 shadow-raised" style={{ animationDelay: `${150 + i * 120}ms`, marginLeft: `${i * 20}px` }}>
                <p className="text-sm text-ink">&ldquo;{example.text}&rdquo;</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {example.tags.map(([kind, label]) => <span key={label} className={cn('tag px-2 py-0.5 text-xs', `tag-${kind}`)}>{label}</span>)}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-ink-3">&copy; {new Date().getFullYear()} FeedbackOS · Built for SaaS product teams</p>
      </aside>

      <main className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10"><Brand subtitle="Feedback triage" /></div>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">Sign in</h2>
          <p className="mt-2 text-ink-2">New here? Signing in creates your workspace.</p>

          {emailSent ? (
            <div className="mt-8 rounded-xl border border-line bg-surface p-6" role="status">
              <Mail className="w-6 h-6 text-accent" aria-hidden="true" />
              <h3 className="mt-3 font-display text-lg font-semibold text-ink">Check your inbox</h3>
              <p className="mt-1 text-sm text-ink-2">
                We sent a sign-in link to <strong className="text-ink font-medium">{email}</strong>. It works once and expires in 24 hours.
              </p>
              <button onClick={() => { setEmailSent(false); setEmail('') }} className="mt-4 text-sm text-accent hover:text-accent-hover">
                Use a different email
              </button>
            </div>
          ) : (
            <div className="mt-8 space-y-5">
              <form onSubmit={handleEmailSignIn} className="space-y-3">
                <label htmlFor="email" className="block text-sm text-ink-2">Work email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className={cn(inputClass, 'h-11 text-base sm:text-sm')}
                />
                {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                <button type="submit" disabled={loading !== null || !email} className={buttonClass('primary', 'md', 'w-full h-11')}>
                  {loading === 'email' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <>Send magic link <ArrowRight className="w-4 h-4" aria-hidden="true" /></>}
                </button>
              </form>

              <div className="flex items-center gap-3 text-xs text-ink-3">
                <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
              </div>

              <button onClick={handleGoogleSignIn} disabled={loading !== null} className={buttonClass('secondary', 'md', 'w-full h-11')}>
                {loading === 'google' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : (
                  <svg className="w-4 h-4" aria-hidden="true" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                Continue with Google
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
