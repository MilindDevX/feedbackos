import { cn } from '@/lib/utils'

// Three lines sorting into one: feedback arriving messy and leaving triaged.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('w-6 h-6', className)}>
      <rect width="24" height="24" rx="6.5" fill="var(--accent)" />
      <path d="M6.5 8h11M6.5 12h7.5M6.5 16h4" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17" cy="16" r="1.6" fill="var(--accent-ink)" />
    </svg>
  )
}

export function Brand({ subtitle }: { subtitle?: string | null }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <BrandMark className="w-7 h-7 flex-shrink-0" />
      <div className="min-w-0 leading-tight">
        <div className="font-display text-[15px] font-semibold tracking-tight text-ink">FeedbackOS</div>
        {subtitle && <div className="text-xs text-ink-3 truncate">{subtitle}</div>}
      </div>
    </div>
  )
}
