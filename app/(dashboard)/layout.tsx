import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import type { SessionUser } from '@/auth'
import Sidebar from '@/components/layout/Sidebar'
import TopNav from '@/components/layout/TopNav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as SessionUser
  if (!user.organizationId) redirect('/onboarding')

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <Sidebar user={user} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
