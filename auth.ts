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
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: {
          user: 'resend',
          pass: process.env.RESEND_API_KEY,
        },
      },
      from: process.env.EMAIL_FROM || 'noreply@feedbackos.app',
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
