import type { NextRequest } from 'next/server'
import { handlers } from '@/auth'
import { MAGIC_LINKS_PER_IP_PER_HOUR, isMagicLinkSignIn } from '@/lib/abuse-limits'
import { rateLimit } from '@/lib/rate-limit'

export const { GET } = handlers

export async function POST(req: NextRequest) {
  if (isMagicLinkSignIn(req.nextUrl.pathname)) {
    const limited = await rateLimit(req, 'magic-link-ip', MAGIC_LINKS_PER_IP_PER_HOUR, 3600)
    if (limited) return limited
  }
  return handlers.POST(req)
}
