import { redirect } from 'next/navigation'
import LoginForm from './LoginForm'
import { auth, type SessionUser } from '@/auth'
import { signInErrorMessage } from '@/lib/auth-errors'
import { DEMO_SLUG } from '@/lib/demo/constants'
import { demoEnabled } from '@/lib/features'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  const inDemo = user?.organizationSlug === DEMO_SLUG
  // Signed-in people go straight to their workspace; demo visitors may continue or sign in for real.
  if (user && !inDemo && !error) redirect(user.organizationId ? '/dashboard' : '/onboarding')
  return <LoginForm initialError={signInErrorMessage(error)} demo={demoEnabled()} inDemo={inDemo} />
}
