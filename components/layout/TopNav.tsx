'use client'

import { signOut } from 'next-auth/react'
import { LogOut, Download } from 'lucide-react'
import type { SessionUser } from '@/auth'
import { useEffect, useRef, useState } from 'react'

interface TopNavProps {
  user: SessionUser
}

export default function TopNav({ user }: TopNavProps) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Document listeners instead of a fixed overlay: the header's backdrop-blur would confine
  // a fixed overlay to the header, so clicks elsewhere on the page never closed the menu.
  useEffect(() => {
    if (!showMenu) return
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setShowMenu(false)
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMenu(false) }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [showMenu])

  return (
    <header className="flex-shrink-0 h-14 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm flex items-center justify-between px-6">
      <div className="flex items-center gap-2">
        <span className="text-gray-500 text-sm">
          {user.organizationName}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <a
          href="/api/export"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 text-sm transition-colors"
          title="Export all feedback to CSV"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Export</span>
        </a>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={showMenu}
            className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white hover:ring-2 hover:ring-brand-400/50 transition-all"
          >
            {user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?'}
          </button>

          {showMenu && (
            <div role="menu" className="absolute right-0 top-10 z-20 w-48 glass-card py-1 shadow-xl">
                <div className="px-3 py-2 border-b border-gray-800">
                  <p className="text-xs font-medium text-white truncate">{user.name || user.email}</p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
                <button
                  role="menuitem"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
