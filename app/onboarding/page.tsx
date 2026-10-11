'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Brand } from '@/components/ui/Brand'
import { Notice, buttonClass, inputClass } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

export default function OnboardingPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleNameChange = (v: string) => {
    setName(v)
    setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to create organization')
        return
      }
      // Refresh session to pick up new org context
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-canvas flex flex-col">
      <header className="px-5 sm:px-8 h-16 flex items-center"><Brand /></header>
      <main className="flex-1 flex items-center justify-center px-5 pb-16">
        <div className="w-full max-w-md">
          <p className="text-sm text-accent font-medium">Step 1 of 1</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">Name your workspace</h1>
          <p className="mt-2 text-ink-2">Your team&rsquo;s feedback, themes and reviews live here. You can add people later.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="org-name" className="block text-sm text-ink-2">Organization name</label>
              <input
                id="org-name"
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Acme Corp"
                required
                minLength={2}
                autoFocus
                className={cn(inputClass, 'h-11 text-base sm:text-sm')}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="org-slug" className="block text-sm text-ink-2">Workspace URL</label>
              <div className="flex items-center rounded-md border border-line bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft overflow-hidden">
                <span className="pl-3 text-sm text-ink-3 flex-shrink-0">feedbackos.app/</span>
                <input
                  id="org-slug"
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="acme-corp"
                  required
                  minLength={2}
                  aria-describedby="org-slug-hint"
                  className="flex-1 min-w-0 h-11 px-1 bg-transparent text-base sm:text-sm text-ink placeholder:text-ink-3 focus:outline-none"
                />
              </div>
              <p id="org-slug-hint" className="text-xs text-ink-3">Lowercase letters, numbers and hyphens.</p>
            </div>

            {error && <Notice tone="error">{error}</Notice>}

            <button type="submit" disabled={loading || !name || !slug} className={buttonClass('primary', 'md', 'w-full h-11')}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <>Create workspace <ArrowRight className="w-4 h-4" aria-hidden="true" /></>}
            </button>
          </form>

          <p className="mt-8 text-sm text-ink-3">
            Next: import a CSV or paste a few messages. Each one is classified by theme, sentiment and product area within seconds.
          </p>
        </div>
      </main>
    </div>
  )
}
