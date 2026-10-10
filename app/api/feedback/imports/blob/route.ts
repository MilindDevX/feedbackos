// Token exchange for the browser's direct private-Blob upload, plus Vercel Blob's signed completion callback.
import { NextRequest, NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { auth, type SessionUser } from '@/auth'
import { rateLimit } from '@/lib/rate-limit'
import { privateCsvBlob } from '@/lib/imports/blob'
import { authorizeCsvUpload, completeAuthorizedCsvUpload } from '@/lib/imports/routes'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody
  if (body.type === 'blob.generate-client-token') {
    const limited = await rateLimit(request, 'csv-import-token', 20, 3600)
    if (limited) return limited
  }
  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await auth()
        return authorizeCsvUpload((session?.user as SessionUser | undefined) ?? null, pathname, clientPayload)
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        await completeAuthorizedCsvUpload(blob, tokenPayload, privateCsvBlob)
      },
    })
    return NextResponse.json(response)
  } catch {
    return NextResponse.json({ error: 'Upload could not be authorized' }, { status: 400 })
  }
}
