import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import type { SessionUser } from '@/auth'

export default async function Home() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as SessionUser
  if (!user.organizationId) redirect('/onboarding')
  redirect('/dashboard')
}
