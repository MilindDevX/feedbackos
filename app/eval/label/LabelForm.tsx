'use client'

import { useCallback, useEffect, useState } from 'react'
import { EVALUATION_CATEGORIES } from '@/lib/ai/evaluation'
import { buttonClass } from '@/components/ui/primitives'
import { cn, formatTheme } from '@/lib/utils'

type Theme = (typeof EVALUATION_CATEGORIES)[number]
type Item = { id: string; text: string }
type Draft = { theme: Theme | null; secondary: Theme[]; sentiment: string | null; unsure: boolean; check: boolean }
const SENTIMENTS = [
  { value: 'positive', key: 'p' }, { value: 'negative', key: 'n' }, { value: 'neutral', key: 'u' }, { value: 'mixed', key: 'm' },
] as const

export default function LabelForm() {
  const [item, setItem] = useState<Item | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [theme, setTheme] = useState<Theme | null>(null)
  const [secondary, setSecondary] = useState<Theme[]>([])
  const [sentiment, setSentiment] = useState<string | null>(null)
  const [previous, setPrevious] = useState<Item | null>(null)
  const [message, setMessage] = useState('')
  const [tick, setTick] = useState(0)
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    let cancelled = false
    // Review mode (?drafts=1) pre-fills an AI-drafted label to accept or correct; the default page stays blind.
    const reviewing = new URLSearchParams(window.location.search).get('drafts') === '1'
    fetch(`/api/eval/labels${reviewing ? '?drafts=1' : ''}`).then((r) => r.json()).then((json) => {
      if (cancelled) return
      setItem(json.item)
      setDraft(json.draft ?? null)
      if (json.draft) { setTheme(json.draft.theme); setSecondary(json.draft.secondary); setSentiment(json.draft.sentiment) }
      setProgress({ done: json.done, total: json.total })
    })
    return () => { cancelled = true }
  }, [tick])

  const reset = () => { setTheme(null); setSecondary([]); setSentiment(null) }
  const toggleSecondary = useCallback((t: Theme) => {
    setSecondary((s) => s.includes(t) ? s.filter((x) => x !== t) : s.length < 2 ? [...s, t] : s)
  }, [])

  const save = useCallback(async (unsure = false) => {
    if (!item) return
    if (!unsure && (!theme || !sentiment)) { setMessage('Choose a theme and a sentiment, or press ? if you are unsure.'); return }
    const res = await fetch('/api/eval/labels', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, theme, secondary: secondary.filter((t) => t !== theme), sentiment, unsure, labelledAt: new Date().toISOString() }),
    })
    if (!res.ok) { setMessage('Could not save this label.'); return }
    setPrevious(item)
    setMessage('')
    reset()
    setTick((t) => t + 1)
  }, [item, theme, secondary, sentiment])

  // Undo shows the last item again; saving it appends a newer label that replaces the old one.
  const undo = () => { if (previous) { setItem(previous); setPrevious(null); setDraft(null); reset() } }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'SELECT') return
      const digit = /^Digit([1-6])$/.exec(e.code)
      if (digit) {
        const t = EVALUATION_CATEGORIES[Number(digit[1]) - 1]
        if (e.shiftKey) toggleSecondary(t); else setTheme(t)
        e.preventDefault()
        return
      }
      const s = SENTIMENTS.find((x) => x.key === e.key.toLowerCase())
      if (s && !e.metaKey && !e.ctrlKey) { setSentiment(s.value); return }
      if (e.key === '?') { e.preventDefault(); save(true); return }
      if (e.key === 'Enter') { e.preventDefault(); save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, toggleSecondary])

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Label the golden set</h1>
        <p className="tabular text-sm text-ink-3" aria-live="polite">{progress.done} / {progress.total} labelled</p>
      </div>
      <p className="mt-1 text-sm text-ink-3">Read the review and choose what it is about. The model&rsquo;s answer is hidden on purpose.</p>

      <details open className="mt-5 rounded-lg border border-line bg-sunken px-4 py-3 text-sm text-ink-2">
        <summary className="cursor-pointer font-medium text-ink">Decision rules (the same ones the classifier follows)</summary>
        <ul className="mt-2 space-y-1.5 list-disc pl-5">
          <li><strong className="text-ink">Main theme = the most actionable part:</strong> problem &gt; request &gt; question &gt; praise.</li>
          <li><strong className="text-ink">Bug:</strong> something broken, crashing or wrong. <strong className="text-ink">Usability:</strong> works, but confusing, slow, too many ads or annoying. <strong className="text-ink">Feature request:</strong> &ldquo;please add / change&rdquo;. <strong className="text-ink">Question:</strong> &ldquo;how do I&hellip;?&rdquo;. <strong className="text-ink">Praise:</strong> only happy. <strong className="text-ink">Other:</strong> bans, policy, politics, off-topic.</li>
          <li><strong className="text-ink">&ldquo;Good, but could improve X&rdquo;:</strong> main theme = X, add <em>+ Praise</em>, sentiment <em>Mixed</em>.</li>
          <li><strong className="text-ink">Sentiment:</strong> Mixed = any praise plus any complaint or request. Neutral = a passing comment or question with no clear feeling. Otherwise Positive or Negative.</li>
          <li><strong className="text-ink">Genuinely ambiguous?</strong> Press <kbd>?</kbd> (Unsure). It is kept but left out of the scores.</li>
        </ul>
      </details>

      {!item ? (
        <p className="mt-10 text-ink">{progress.total ? 'All items are labelled. Thank you!' : 'Loading…'}</p>
      ) : (
        <div className="mt-8 space-y-6">
          {draft && (
            <p role="status" className={cn('rounded-lg border px-4 py-2 text-sm', draft.check ? 'border-danger text-danger' : 'border-line text-ink-2')}>
              {draft.unsure ? 'AI draft: could not tell what this review means. Label it yourself or press ? to keep it unsure.'
                : draft.check ? 'AI draft, low confidence: read this one carefully before accepting.'
                : 'AI draft (not the classifier). Press Enter to accept, or change anything that is wrong.'}
            </p>
          )}
          <blockquote className="rounded-xl border border-line bg-surface p-5 text-lg leading-relaxed text-ink whitespace-pre-wrap">{item.text}</blockquote>

          <fieldset>
            <legend className="text-sm font-medium text-ink">Main theme <span className="text-ink-3">(keys 1–6)</span></legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {EVALUATION_CATEGORIES.map((t, i) => (
                <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}
                  className={cn(buttonClass('secondary', 'sm'), theme === t && 'border-accent bg-accent-soft text-accent')}>
                  {i + 1} · {formatTheme(t.toUpperCase())}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-ink">Also mentions <span className="text-ink-3">(Shift + 1–6, up to 2)</span></legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {EVALUATION_CATEGORIES.filter((t) => t !== theme).map((t) => (
                <button key={t} type="button" aria-pressed={secondary.includes(t)} onClick={() => toggleSecondary(t)}
                  className={cn(buttonClass('ghost', 'sm'), 'border border-line', secondary.includes(t) && 'border-accent text-accent')}>
                  + {formatTheme(t.toUpperCase())}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-ink">Sentiment <span className="text-ink-3">(P · N · U · M)</span></legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {SENTIMENTS.map((s) => (
                <button key={s.value} type="button" aria-pressed={sentiment === s.value} onClick={() => setSentiment(s.value)}
                  className={cn(buttonClass('secondary', 'sm'), 'capitalize', sentiment === s.value && 'border-accent bg-accent-soft text-accent')}>
                  {s.key.toUpperCase()} · {s.value}
                </button>
              ))}
            </div>
          </fieldset>

          {message && <p role="alert" className="text-sm text-danger">{message}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => save()} className={buttonClass('primary')}>Save (Enter)</button>
            <button type="button" onClick={() => save(true)} className={buttonClass('secondary')}>Unsure (?)</button>
            <button type="button" onClick={undo} disabled={!previous} className={buttonClass('ghost')}>Undo last</button>
          </div>
        </div>
      )}
    </main>
  )
}
