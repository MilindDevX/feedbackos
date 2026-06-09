'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { Mail, Globe, Zap, BarChart3, Tag, ArrowRight, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [loading, setLoading] = useState<'google' | 'email' | null>(null)
  const [error, setError] = useState('')

  const handleGoogleSignIn = async () => {
    setLoading('google')
    setError('')
    await signIn('google', { callbackUrl: '/dashboard' })
  }

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading('email')
    setError('')
    try {
      const result = await signIn('nodemailer', {
        email,
        redirect: false,
        callbackUrl: '/dashboard',
      })
      if (result?.error) {
        setError('Failed to send magic link. Please try again.')
      } else {
        setEmailSent(true)
      }
    } finally {
      setLoading(null)
    }
  }

  const features = [
    { icon: Zap, text: 'AI classifies feedback in under 2 seconds' },
    { icon: BarChart3, text: 'Trend dashboard shows what customers care about' },
    { icon: Tag, text: 'Auto-tags themes, sentiment, and product areas' },
  ]

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-gray-900 border-r border-gray-800 p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/40 via-transparent to-purple-900/20 pointer-events-none" />
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold text-white">FeedbackOS</span>
          </div>
          <p className="text-gray-500 text-sm">Intelligent feedback triage</p>
        </div>

        <div className="relative space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight">
              Stop manually tagging
              <span className="gradient-text block">customer feedback.</span>
            </h1>
            <p className="mt-4 text-gray-400 text-lg leading-relaxed">
              GPT-4o-mini reads, classifies, and routes every feedback item automatically. 
              Reclaim 5–10 hours of PM time every week.
            </p>
          </div>

          <div className="space-y-4">
            {features.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-900/60 border border-brand-700/30 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-brand-400" />
                </div>
                <span className="text-gray-300">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <p className="text-gray-600 text-sm">
            &copy; {new Date().getFullYear()} FeedbackOS. Built for SaaS product teams.
          </p>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <div className="flex items-center gap-2 mb-6 lg:hidden">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold text-white">FeedbackOS</span>
            </div>
            <h2 className="text-3xl font-bold text-white">Welcome back</h2>
            <p className="mt-2 text-gray-400">Sign in to your workspace</p>
          </div>

          {emailSent ? (
            <div className="glass-card p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto">
                <Mail className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-white">Check your inbox</h3>
              <p className="text-gray-400">
                We sent a magic link to <strong className="text-white">{email}</strong>.
                Click the link to sign in — no password needed.
              </p>
              <button
                onClick={() => { setEmailSent(false); setEmail('') }}
                className="text-brand-400 hover:text-brand-300 text-sm transition-colors"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Google OAuth */}
              <button
                onClick={handleGoogleSignIn}
                disabled={loading !== null}
                className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-white hover:bg-gray-50 text-gray-900 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
              >
                {loading === 'google' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                Continue with Google
              </button>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-800" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-gray-950 text-gray-500">or continue with email</span>
                </div>
              </div>

              {/* Email magic link */}
              <form onSubmit={handleEmailSignIn} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                />
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={loading !== null || !email}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-brand-500/25"
                >
                  {loading === 'email' ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Send magic link
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="text-center text-gray-500 text-sm">
                No account needed. Sign in to create your workspace.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
