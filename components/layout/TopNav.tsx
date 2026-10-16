'use client'

import { signOut } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import { LogOut, Download, Menu, X } from 'lucide-react'
import type { SessionUser } from '@/auth'
import { useEffect, useRef, useState } from 'react'
import { Brand } from '@/components/ui/Brand'
import { NavLinks, UserCard, navItems } from './Sidebar'

function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close() }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close, ref])
}

function MobileNav({ user, onClose }: { user: SessionUser; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  useDismiss(true, onClose, panelRef)

  // Modal drawer: move focus in, keep Tab inside it, and give focus back to the menu button on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])
    focusable()[0]?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      opener?.focus()
    }
  }, [])

  return createPortal(
    <div className="lg:hidden fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[oklch(18%_0.02_275/0.4)] fade-in" aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Navigation" className="drawer-left absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-sunken border-r border-line flex flex-col">
        <div className="h-14 px-4 flex items-center justify-between">
          <Brand subtitle={user.organizationName} />
          <button onClick={onClose} aria-label="Close navigation" className="w-9 h-9 -mr-1.5 rounded-md flex items-center justify-center text-ink-2 hover:bg-hover">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 px-3 pt-3"><NavLinks onNavigate={onClose} /></div>
        <div className="px-2 py-3 border-t border-line"><UserCard user={user} /></div>
      </div>
    </div>,
    document.body
  )
}

export default function TopNav({ user }: { user: SessionUser }) {
  const [showMenu, setShowMenu] = useState(false)
  const [showNav, setShowNav] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const closeMenu = () => setShowMenu(false)
  useDismiss(showMenu, closeMenu, menuRef)

  const section = navItems.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`))?.label

  return (
    <header className="flex-shrink-0 h-14 border-b border-line bg-canvas flex items-center justify-between gap-3 px-4 sm:px-6">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={() => setShowNav(true)}
          aria-label="Open navigation"
          aria-expanded={showNav}
          className="lg:hidden w-9 h-9 -ml-1.5 rounded-md flex items-center justify-center text-ink-2 hover:bg-hover"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>
        <p className="text-sm text-ink-3 truncate">
          <span className="hidden sm:inline">{user.organizationName}</span>
          {section && <><span className="hidden sm:inline px-1.5 text-line-strong">/</span><span className="text-ink font-medium">{section}</span></>}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <a
          href="/api/export"
          className="flex items-center gap-1.5 h-9 px-2.5 rounded-md text-ink-2 hover:text-ink hover:bg-hover text-sm transition-colors"
          title="Export all feedback to CSV"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Export</span>
        </a>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={showMenu}
            className="w-8 h-8 ml-1 rounded-full bg-accent-soft text-accent flex items-center justify-center text-xs font-semibold hover:ring-2 hover:ring-line-strong transition-shadow"
          >
            {user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?'}
          </button>

          {showMenu && (
            <div role="menu" className="rise-in absolute right-0 top-10 z-30 w-56 rounded-lg border border-line bg-surface shadow-raised py-1">
              <div className="px-3 py-2 border-b border-line">
                <p className="text-sm font-medium text-ink truncate">{user.name || user.email}</p>
                <p className="text-xs text-ink-3 truncate">{user.email}</p>
              </div>
              <button
                role="menuitem"
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-2 hover:text-ink hover:bg-hover transition-colors"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
      {showNav && <MobileNav user={user} onClose={() => setShowNav(false)} />}
    </header>
  )
}
