import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import type { SessionUser } from '@/auth'
import { DEMO_SLUG } from '@/lib/demo/constants'

export default async function Home() {
  const session = await auth()
  if (!session) redirect('/login')
  const user = session.user as SessionUser
  // Typing the site address should not drop a past demo visitor back into the demo.
  if (user.organizationSlug === DEMO_SLUG) redirect('/login')
  if (!user.organizationId) redirect('/onboarding')
  redirect('/dashboard')
}
