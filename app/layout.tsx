import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google'
import './globals.css'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/auth'

const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-body', display: 'swap' })
const heading = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-heading', display: 'swap' })

export const metadata: Metadata = {
  title: 'FeedbackOS — AI-Powered Customer Feedback Triage',
  description: 'Automatically classify, tag, and surface trends from customer feedback. Eliminate 5–10 hours of weekly PM work.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9f9fc' },
    { media: '(prefers-color-scheme: dark)', color: '#16161d' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <html lang="en">
      <body suppressHydrationWarning className={`${body.variable} ${heading.variable} font-sans antialiased`}>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
