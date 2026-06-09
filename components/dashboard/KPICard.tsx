import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface KPICardProps {
  title: string
  value: string | number
  icon: LucideIcon
  color: 'brand' | 'red' | 'amber' | 'purple' | 'green'
  description: string
  loading?: boolean
}

const colorMap = {
  brand: {
    bg: 'bg-brand-500/10',
    border: 'border-brand-500/20',
    icon: 'text-brand-400',
    value: 'text-brand-300',
  },
  red: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    icon: 'text-red-400',
    value: 'text-red-300',
  },
  amber: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    icon: 'text-amber-400',
    value: 'text-amber-300',
  },
  purple: {
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    icon: 'text-purple-400',
    value: 'text-white',
  },
  green: {
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    icon: 'text-green-400',
    value: 'text-green-300',
  },
}

export default function KPICard({ title, value, icon: Icon, color, description, loading }: KPICardProps) {
  const colors = colorMap[color]

  if (loading) {
    return <div className="glass-card p-5 h-28 skeleton" />
  }

  return (
    <div className={cn('glass-card p-5 border', colors.border, 'hover:border-opacity-50 transition-all duration-200')}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</p>
          <p className={cn('text-3xl font-bold tracking-tight', colors.value)}>{value}</p>
          <p className="text-xs text-gray-600">{description}</p>
        </div>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', colors.bg)}>
          <Icon className={cn('w-5 h-5', colors.icon)} />
        </div>
      </div>
    </div>
  )
}
