import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import type { SessionUser } from '@/auth'
import Sidebar from '@/components/layout/Sidebar'
import TopNav from '@/components/layout/TopNav'
import ReadOnlyBanner from '@/components/layout/ReadOnlyBanner'
import { canWrite } from '@/lib/permissions'
import { DEMO_SLUG } from '@/lib/demo/workspace'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as SessionUser
  if (!user.organizationId) redirect('/onboarding')

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar user={user} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!canWrite(user) && <ReadOnlyBanner demo={user.organizationSlug === DEMO_SLUG} />}
        <TopNav user={user} />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  )
}
