import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import EmailProvider from 'next-auth/providers/nodemailer'
import { db } from '@/lib/db'
import { magicLinkDelivery, senderAddress, signInEmail } from '@/lib/email-delivery'
import { createTransport } from 'nodemailer'
import { magicLinkEmailLimited } from '@/lib/abuse-limits'

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
        // Port 465 is TLS from the start; 587 upgrades with STARTTLS, which `secure: true` would break.
        secure: (Number(process.env.EMAIL_SERVER_PORT) || 465) === 465,
        auth: {
          user: process.env.EMAIL_SERVER_USER || 'resend',
          pass: process.env.EMAIL_SERVER_PASSWORD || process.env.RESEND_API_KEY || 'missing-key',
        },
      },
      from: senderAddress({ EMAIL_FROM: process.env.EMAIL_FROM, EMAIL_SERVER_USER: process.env.EMAIL_SERVER_USER, EMAIL_SERVER_HOST: process.env.EMAIL_SERVER_HOST }),
      async sendVerificationRequest({ identifier, url, provider }) {
        const delivery = magicLinkDelivery(process.env)
        if (delivery === 'misconfigured') {
          // Never print sign-in links on a deployed app: anyone with log access could use them.
          console.error('[auth] Email delivery is not configured (missing or placeholder EMAIL_SERVER_PASSWORD/RESEND_API_KEY)')
          throw new Error('Email delivery is not configured')
        }
        // Stops email-bombing an address and protects the sender account's daily sending limit.
        if (await magicLinkEmailLimited(identifier)) {
          throw new Error('Too many sign-in emails for this address')
        }
        if (delivery === 'log') {
          console.log(`\n======================================================\n`)
          console.log(`🔐 MAGIC LINK FOR ${identifier}:`)
          console.log(`${url}`)
          console.log(`\n======================================================\n`)
          return
        }
        
        const transport = createTransport(provider.server)
        const { subject, text, html } = signInEmail(url, new URL(url).host)
        await transport.sendMail({ to: identifier, from: provider.from, subject, text, html })
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
