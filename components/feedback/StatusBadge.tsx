import { cn, formatStatus } from '@/lib/utils'

export default function StatusBadge({ status }: { status: string }) {
  return <span className={cn('tag px-2 py-0.5 text-xs', `tag-${status.toLowerCase()}`)}>{formatStatus(status)}</span>
}
