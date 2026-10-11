// ABOUTME: Localhost-only test sign-in: creates a seeded test user and workspace and a real database session.
// ABOUTME: Lets automated local tests exercise signed-in flows; 404 unless LOCAL_TEST_MODE=1 under `next dev` on loopback.
import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isLocalHost, localTestMode } from '@/lib/local-test-mode'

const LOCAL_TEST_EMAIL = 'local-test@feedbackos.test'
const SESSION_HOURS = 12

export async function GET(request: NextRequest) {
  if (!localTestMode() || !isLocalHost(request.headers.get('host'))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const user = await db.user.upsert({
    where: { email: LOCAL_TEST_EMAIL },
    create: { email: LOCAL_TEST_EMAIL, name: 'Local Test', emailVerified: new Date() },
    update: {},
  })
  const organization = await db.organization.upsert({
    where: { slug: 'local-test' },
    create: { name: 'Local Test Workspace', slug: 'local-test' },
    update: {},
  })
  await db.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
    create: { organizationId: organization.id, userId: user.id, role: 'OWNER' },
    update: { role: 'OWNER' },
  })

  const expires = new Date(Date.now() + SESSION_HOURS * 3600_000)
  const sessionToken = randomBytes(32).toString('hex')
  await db.session.create({ data: { sessionToken, userId: user.id, expires } })

  const next = request.nextUrl.searchParams.get('next')
  const destination = next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
  const response = NextResponse.redirect(new URL(destination, request.url))
  // Same cookie Auth.js reads for database sessions over plain http.
  response.cookies.set('authjs.session-token', sessionToken, { httpOnly: true, sameSite: 'lax', path: '/', expires })
  return response
}
