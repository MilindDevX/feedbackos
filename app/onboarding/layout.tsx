import { redirect } from 'next/navigation'
import { auth, type SessionUser } from '@/auth'

// Onboarding is only for signed-in users who have no workspace yet.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  if ((session.user as SessionUser).organizationId) redirect('/dashboard')
  return children
}
