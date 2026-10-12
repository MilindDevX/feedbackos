import LoginForm from './LoginForm'
import { signInErrorMessage } from '@/lib/auth-errors'
import { demoEnabled } from '@/lib/features'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return <LoginForm initialError={signInErrorMessage(error)} demo={demoEnabled()} />
}
