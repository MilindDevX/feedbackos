import { cn, formatTheme } from '@/lib/utils'

export default function ThemeBadge({ theme, size = 'sm', secondary = false }: { theme: string; size?: 'sm' | 'md'; secondary?: boolean }) {
  return (
    <span
      className={cn('tag', `tag-${theme.toLowerCase()}`, size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm', secondary && 'opacity-80')}
      title={secondary ? `Also mentions: ${formatTheme(theme)}` : undefined}
    >
      {secondary && <span aria-hidden="true">+</span>}
      {secondary && <span className="sr-only">Also mentions </span>}
      {formatTheme(theme)}
    </span>
  )
}
