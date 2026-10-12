'use client'

import { signOut } from 'next-auth/react'
import { Eye } from 'lucide-react'

export default function ReadOnlyBanner({ demo }: { demo: boolean }) {
  return (
    <aside aria-label="Workspace access" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-line bg-accent-soft px-4 py-2 text-sm text-ink">
      <span className="inline-flex items-center gap-1.5">
        <Eye className="w-4 h-4 text-accent" aria-hidden="true" />
        {demo ? 'You are exploring a read-only demo with sample feedback.' : 'You have view-only access to this workspace.'}
      </span>
      {demo && (
        <button onClick={() => signOut({ callbackUrl: '/login' })} className="font-medium text-accent hover:text-accent-hover underline underline-offset-2">
          Use your own feedback
        </button>
      )}
    </aside>
  )
}
