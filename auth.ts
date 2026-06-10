import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import EmailProvider from 'next-auth/providers/nodemailer'
import { db } from '@/lib/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST || 'smtp.resend.com',
        port: Number(process.env.EMAIL_SERVER_PORT) || 465,
        secure: true,
        auth: {
          user: process.env.EMAIL_SERVER_USER || 'resend',
          pass: process.env.EMAIL_SERVER_PASSWORD || process.env.RESEND_API_KEY || 'missing-key',
        },
      },
      from: process.env.EMAIL_FROM || 'noreply@feedbackos.app',
      sendVerificationRequest({ identifier, url, provider }) {
        const pass = process.env.EMAIL_SERVER_PASSWORD || process.env.RESEND_API_KEY
        const isPlaceholderKey = !pass || pass === 're_placeholder' || pass === 'missing-key'
        
        if (isPlaceholderKey) {
          console.log(`\n======================================================\n`)
          console.log(`🔐 MAGIC LINK FOR ${identifier}:`)
          console.log(`${url}`)
          console.log(`\n======================================================\n`)
          return
        }
        
        // Otherwise, use the default Nodemailer transport
        // We import nodemailer dynamically here to avoid cluttering the global scope
        const { createTransport } = require('nodemailer')
        const transport = createTransport(provider.server)
        return transport.sendMail({
          to: identifier,
          from: provider.from,
          subject: `Sign in to FeedbackOS`,
          text: `Sign in by clicking here: ${url}`,
          html: `<p>Sign in to FeedbackOS by clicking the link below:</p><p><a href="${url}">Sign in</a></p>`
        })
      }
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'database',
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id

        // Attach org context to session
        const membership = await db.organizationMember.findFirst({
          where: { userId: user.id },
          include: { organization: true },
          orderBy: { joinedAt: 'asc' },
        })

        if (membership) {
          ;(session.user as SessionUser).organizationId = membership.organizationId
          ;(session.user as SessionUser).organizationSlug = membership.organization.slug
          ;(session.user as SessionUser).organizationName = membership.organization.name
          ;(session.user as SessionUser).role = membership.role
        }
      }
      return session
    },
  },
})

export interface SessionUser {
  id: string
  email: string
  name?: string | null
  image?: string | null
  organizationId?: string
  organizationSlug?: string
  organizationName?: string
  role?: string
}
