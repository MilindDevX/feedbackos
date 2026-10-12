// ABOUTME: Public entry to the read-only demo: signs the visitor in as the shared demo VIEWER for two hours.
import { NextRequest, NextResponse } from 'next/server'
import { ensureDemoWorkspace } from '@/lib/demo/workspace'
import { demoEnabled } from '@/lib/features'
import { rateLimit } from '@/lib/rate-limit'
import { sessionRedirect } from '@/lib/session'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  if (!demoEnabled()) return NextResponse.redirect(new URL('/login', request.url))
  // Each visit creates a session row; this keeps scripted visits from filling the table.
  const limited = await rateLimit(request, 'demo-session', 20, 3600)
  if (limited) return limited
  const { userId } = await ensureDemoWorkspace()
  return sessionRedirect(request, userId, 2, '/dashboard')
}
