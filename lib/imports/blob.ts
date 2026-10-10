// ABOUTME: Server-only adapter for the private Vercel Blob store used by CSV imports.
import { del, get, head } from '@vercel/blob'

export const privateCsvBlob = {
  async readBlob(pathname: string): Promise<string> {
    const result = await get(pathname, { access: 'private' })
    if (!result || result.statusCode !== 200 || !result.stream) throw new Error('Uploaded CSV could not be read')
    return new Response(result.stream).text()
  },
  async deleteBlob(pathname: string): Promise<void> {
    await del(pathname)
  },
  async blobSize(pathname: string): Promise<number> {
    return (await head(pathname)).size
  },
}
