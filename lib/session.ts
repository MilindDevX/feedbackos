// ABOUTME: Creates a real Auth.js database session and the cookie that carries it.
// ABOUTME: Used only by the public read-only demo and the localhost test sign-in; never accepts credentials.
import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function sessionRedirect(request: NextRequest, userId: string, hours: number, destination: string): Promise<NextResponse> {
  const expires = new Date(Date.now() + hours * 3600_000)
  const sessionToken = randomBytes(32).toString('hex')
  await db.session.create({ data: { sessionToken, userId, expires } })

  // Auth.js reads the __Secure- cookie over https and the plain one over http (local development).
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]
  const secure = (forwardedProto ?? request.nextUrl.protocol.replace(':', '')) === 'https'
  const response = NextResponse.redirect(new URL(destination, request.url))
  response.cookies.set(secure ? '__Secure-authjs.session-token' : 'authjs.session-token', sessionToken, {
    httpOnly: true, sameSite: 'lax', path: '/', secure, expires,
  })
  return response
}

// Only same-site paths, so the redirect cannot be pointed at another site.
export function safeNextPath(next: string | null, fallback = '/dashboard'): string {
  return next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback
}
