'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Inbox, LayoutDashboard, Upload, Plug } from 'lucide-react'
import type { SessionUser } from '@/auth'
import { Brand } from '@/components/ui/Brand'
import { cn } from '@/lib/utils'

export const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/feedback', icon: Inbox, label: 'Feedback' },
  { href: '/ingest', icon: Upload, label: 'Ingest' },
  { href: '/integrations', icon: Plug, label: 'Integrations' },
]

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Main" className="space-y-0.5">
      {navItems.map(({ href, icon: Icon, label }) => {
        const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors',
              isActive ? 'bg-surface text-ink font-medium shadow-raised' : 'text-ink-2 hover:text-ink hover:bg-hover'
            )}
          >
            <Icon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-accent' : 'text-ink-3')} aria-hidden="true" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export function UserCard({ user }: { user: SessionUser }) {
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-2">
      <div className="w-7 h-7 rounded-full bg-accent-soft text-accent flex items-center justify-center text-xs font-semibold flex-shrink-0">
        {user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-ink truncate">{user.name || user.email}</div>
        <div className="text-xs text-ink-3 truncate capitalize">{user.role?.toLowerCase()}</div>
      </div>
    </div>
  )
}

export default function Sidebar({ user }: { user: SessionUser }) {
  return (
    <aside className="hidden lg:flex w-60 flex-shrink-0 flex-col bg-sunken border-r border-line">
      <div className="px-4 h-14 flex items-center">
        <Brand subtitle={user.organizationName} />
      </div>
      <div className="flex-1 px-3 pt-4">
        <NavLinks />
      </div>
      <div className="px-2 py-3 border-t border-line">
        <UserCard user={user} />
        <p className="px-2.5 pt-1 text-xs text-ink-3">
          <a href="/privacy" className="hover:text-ink">Privacy</a> · <a href="/terms" className="hover:text-ink">Terms</a>
        </p>
      </div>
    </aside>
  )
}
