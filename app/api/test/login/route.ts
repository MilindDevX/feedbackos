// ABOUTME: Localhost-only test sign-in: creates a seeded test user and workspace and a real database session.
// ABOUTME: Lets automated local tests exercise signed-in flows; 404 unless LOCAL_TEST_MODE=1 under `next dev` on loopback.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isLocalHost, localTestMode } from '@/lib/local-test-mode'
import { safeNextPath, sessionRedirect } from '@/lib/session'

const LOCAL_TEST_EMAIL = 'local-test@feedbackos.test'

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

  return sessionRedirect(request, user.id, 12, safeNextPath(request.nextUrl.searchParams.get('next')))
}
