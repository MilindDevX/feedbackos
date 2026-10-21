'use client'

import { useCallback, useEffect, useState } from 'react'
import { EVALUATION_CATEGORIES } from '@/lib/ai/evaluation'
import { buttonClass, inputClass } from '@/components/ui/primitives'
import { cn, formatTheme } from '@/lib/utils'

type Theme = (typeof EVALUATION_CATEGORIES)[number]
type Item = { id: string; text: string }
const SENTIMENTS = [
  { value: 'positive', key: 'p' }, { value: 'negative', key: 'n' }, { value: 'neutral', key: 'u' }, { value: 'mixed', key: 'm' },
] as const
const AREAS = ['Dashboard', 'Authentication', 'API', 'Billing', 'Onboarding', 'Integrations', 'Other']

export default function LabelForm() {
  const [item, setItem] = useState<Item | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [theme, setTheme] = useState<Theme | null>(null)
  const [secondary, setSecondary] = useState<Theme[]>([])
  const [sentiment, setSentiment] = useState<string | null>(null)
  const [area, setArea] = useState('Other')
  const [previous, setPrevious] = useState<Item | null>(null)
  const [message, setMessage] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/eval/labels').then((r) => r.json()).then((json) => {
      if (cancelled) return
      setItem(json.item)
      setProgress({ done: json.done, total: json.total })
    })
    return () => { cancelled = true }
  }, [tick])

  const reset = () => { setTheme(null); setSecondary([]); setSentiment(null); setArea('Other') }
  const toggleSecondary = useCallback((t: Theme) => {
    setSecondary((s) => s.includes(t) ? s.filter((x) => x !== t) : s.length < 2 ? [...s, t] : s)
  }, [])

  const save = useCallback(async () => {
    if (!item || !theme || !sentiment) { setMessage('Choose a theme and a sentiment first.'); return }
    const res = await fetch('/api/eval/labels', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, theme, secondary: secondary.filter((t) => t !== theme), sentiment, productArea: area, labelledAt: new Date().toISOString() }),
    })
    if (!res.ok) { setMessage('Could not save this label.'); return }
    setPrevious(item)
    setMessage('')
    reset()
    setTick((t) => t + 1)
  }, [item, theme, secondary, sentiment, area])

  // Undo shows the last item again; saving it appends a newer label that replaces the old one.
  const undo = () => { if (previous) { setItem(previous); setPrevious(null); reset() } }

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

      {!item ? (
        <p className="mt-10 text-ink">{progress.total ? 'All items are labelled. Thank you!' : 'Loading…'}</p>
      ) : (
        <div className="mt-8 space-y-6">
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

          <label className="block text-sm font-medium text-ink">
            Product area
            <select value={area} onChange={(e) => setArea(e.target.value)} className={cn(inputClass, 'mt-2')}>
              {AREAS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>

          {message && <p role="alert" className="text-sm text-danger">{message}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} className={buttonClass('primary')}>Save (Enter)</button>
            <button type="button" onClick={undo} disabled={!previous} className={buttonClass('ghost')}>Undo last</button>
          </div>
        </div>
      )}
    </main>
  )
}
