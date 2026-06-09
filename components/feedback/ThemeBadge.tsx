import { cn, formatTheme } from '@/lib/utils'

interface ThemeBadgeProps {
  theme: string
  size?: 'sm' | 'md'
}

export default function ThemeBadge({ theme, size = 'sm' }: ThemeBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full font-medium',
      `badge-${theme.toLowerCase()}`,
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
    )}>
      {formatTheme(theme)}
    </span>
  )
}
