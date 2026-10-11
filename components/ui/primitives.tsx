import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

const base = 'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
  secondary: 'bg-surface text-ink border border-line hover:bg-hover hover:border-line-strong',
  ghost: 'text-ink-2 hover:text-ink hover:bg-hover',
}

export function buttonClass(variant: ButtonVariant = 'secondary', size: 'sm' | 'md' = 'md', className?: string) {
  return cn(base, variants[variant], size === 'sm' ? 'h-8 px-3' : 'h-9 px-3.5', className)
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6 sm:mb-8">
      <div className="min-w-0">
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-3 max-w-xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-xl border border-line bg-surface', className)} {...props}>{children}</section>
}

export const inputClass = 'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft'

export function Notice({ tone, children }: { tone: 'success' | 'error' | 'info'; children: React.ReactNode }) {
  const toneClass = { success: 'tag-classified', error: 'tag-negative', info: 'tag-reviewed' }[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('tag w-full rounded-lg px-3 py-2.5 text-sm font-normal whitespace-normal items-start', toneClass)}>
      {children}
    </div>
  )
}
