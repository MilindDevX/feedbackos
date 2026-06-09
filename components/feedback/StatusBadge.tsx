import { cn, formatStatus } from '@/lib/utils'

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      `badge-${status.toLowerCase()}`
    )}>
      {formatStatus(status)}
    </span>
  )
}
