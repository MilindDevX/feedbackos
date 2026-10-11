jest.mock('@/lib/dashboard-cache', () => ({ invalidateDashboard: jest.fn(), dashboardCacheKey: jest.fn() }))
/**
 * UNIT TEST: authorization and validation for the direct-to-Blob CSV import endpoints.
 */
import { Prisma } from '@prisma/client'

jest.mock('@/lib/db', () => ({
  db: {
    csvImport: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    feedbackItem: { groupBy: jest.fn() },
  },
}))
jest.mock('@/lib/imports/csv', () => ({
  ...jest.requireActual('@/lib/imports/csv'),
  refreshCsvImportState: jest.fn(),
  completeCsvImport: jest.fn(),
}))

import { db } from '@/lib/db'
import { completeCsvImport, MAX_CSV_BYTES } from '@/lib/imports/csv'
import {
  authorizeCsvUpload, cancelCsvImport, completeAuthorizedCsvUpload, getCsvImportStatus, startCsvImport,
} from '@/lib/imports/routes'

const user = { id: 'user-1', organizationId: 'org-1' }
const liveImport = { id: 'imp-1', organizationId: 'org-1', state: 'UPLOADING', blobPathname: 'imports/org-1/imp-1.csv' }

beforeEach(() => jest.clearAllMocks())

describe('startCsvImport', () => {
  it('rejects anonymous users and users without an organization', async () => {
    expect((await startCsvImport(null, { columnMapping: { rawText: 'text' } })).status).toBe(401)
    expect((await startCsvImport({ id: 'u', organizationId: undefined }, { columnMapping: { rawText: 'text' } })).status).toBe(400)
  })

  it('rejects a mapping without a text column', async () => {
    expect((await startCsvImport(user, { columnMapping: {} })).status).toBe(400)
    expect(db.csvImport.create).not.toHaveBeenCalled()
  })

  it('creates an uploading import with a server-chosen private path', async () => {
    jest.mocked(db.csvImport.create).mockImplementation((async (args: { data: Record<string, unknown> }) => ({ id: 'imp-9', ...args.data })) as never)

    const result = await startCsvImport(user, { columnMapping: { rawText: 'Feedback' } })

    expect(result.status).toBe(201)
    const data = jest.mocked(db.csvImport.create).mock.calls[0][0].data as Record<string, unknown>
    expect(data).toMatchObject({ organizationId: 'org-1', uploaderId: 'user-1', state: 'UPLOADING' })
    expect(String(data.blobPathname)).toMatch(/^imports\/org-1\/[A-Za-z0-9-]+\.csv$/)
    expect(result.body).toMatchObject({ importId: 'imp-9', pathname: data.blobPathname })
  })

  it('answers 409 when another import is still live', async () => {
    jest.mocked(db.csvImport.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }))

    expect((await startCsvImport(user, { columnMapping: { rawText: 'text' } })).status).toBe(409)
  })
})

describe('authorizeCsvUpload', () => {
  const payload = JSON.stringify({ importId: 'imp-1' })

  it('denies anonymous, cross-organization, finished and mismatched-path uploads', async () => {
    await expect(authorizeCsvUpload(null, liveImport.blobPathname, payload)).rejects.toThrow()
    jest.mocked(db.csvImport.findFirst).mockResolvedValueOnce(null as never)
    await expect(authorizeCsvUpload({ id: 'x', organizationId: 'org-2' }, liveImport.blobPathname, payload)).rejects.toThrow()
    jest.mocked(db.csvImport.findFirst).mockResolvedValueOnce({ ...liveImport, state: 'PROCESSING' } as never)
    await expect(authorizeCsvUpload(user, liveImport.blobPathname, payload)).rejects.toThrow()
    jest.mocked(db.csvImport.findFirst).mockResolvedValueOnce(liveImport as never)
    await expect(authorizeCsvUpload(user, 'imports/org-1/other.csv', payload)).rejects.toThrow()
  })

  it('binds a valid upload to its import and caps size and type', async () => {
    jest.mocked(db.csvImport.findFirst).mockResolvedValueOnce(liveImport as never)

    const options = await authorizeCsvUpload(user, liveImport.blobPathname, payload)

    expect(db.csvImport.findFirst).toHaveBeenCalledWith({ where: { id: 'imp-1', organizationId: 'org-1' } })
    expect(options).toMatchObject({
      maximumSizeInBytes: MAX_CSV_BYTES, addRandomSuffix: false, allowOverwrite: false,
      tokenPayload: JSON.stringify({ importId: 'imp-1' }),
    })
    expect(options.allowedContentTypes).toContain('text/csv')
  })
})

describe('completeAuthorizedCsvUpload', () => {
  it('completes the import named in the signed token using the server-read size', async () => {
    const deps = { readBlob: jest.fn(), deleteBlob: jest.fn(), blobSize: jest.fn().mockResolvedValue(1234) }

    await completeAuthorizedCsvUpload({ pathname: liveImport.blobPathname }, JSON.stringify({ importId: 'imp-1' }), deps)

    expect(completeCsvImport).toHaveBeenCalledWith('imp-1', { pathname: liveImport.blobPathname, size: 1234 }, deps)
  })

  it('ignores a completion without a valid token payload', async () => {
    await completeAuthorizedCsvUpload({ pathname: 'x' }, 'not-json', { readBlob: jest.fn(), deleteBlob: jest.fn(), blobSize: jest.fn() })
    expect(completeCsvImport).not.toHaveBeenCalled()
  })
})

describe('getCsvImportStatus', () => {
  it('returns 404 for an import outside the user organization', async () => {
    jest.mocked(db.csvImport.findFirst).mockResolvedValueOnce(null as never)
    expect((await getCsvImportStatus(user, 'imp-other')).status).toBe(404)
  })

  it('reports counts for the linked rows only, without exposing the blob path', async () => {
    jest.mocked(db.csvImport.findFirst).mockResolvedValueOnce({
      ...liveImport, state: 'PROCESSING', totalRows: 3, importedRows: 2, invalidRows: 1, lastError: null,
      createdAt: new Date(), completedAt: null,
    } as never)
    jest.mocked(db.feedbackItem.groupBy).mockResolvedValueOnce([
      { status: 'PENDING', _count: { _all: 1 } }, { status: 'CLASSIFIED', _count: { _all: 1 } },
    ] as never)

    const result = await getCsvImportStatus(user, 'imp-1')

    expect(result.status).toBe(200)
    expect(jest.mocked(db.feedbackItem.groupBy).mock.calls[0][0]).toMatchObject({ where: { csvImportId: 'imp-1' } })
    expect(result.body).toMatchObject({ state: 'PROCESSING', totalRows: 3, importedRows: 2, invalidRows: 1, queued: 1, classified: 1 })
    expect(JSON.stringify(result.body)).not.toContain('imports/')
  })
})

describe('abandoned uploads do not lock the workspace', () => {
  it('retires this workspace\'s uploads that never completed within 15 minutes before starting', async () => {
    jest.mocked(db.csvImport.create).mockResolvedValue({ id: 'imp-new' } as never)

    await startCsvImport(user, { columnMapping: { rawText: 'text' } })

    const [args] = jest.mocked(db.csvImport.updateMany).mock.calls[0]
    expect(args).toMatchObject({
      where: { organizationId: 'org-1', state: 'UPLOADING' },
      data: { state: 'FAILED', lastError: 'The upload was not completed.' },
    })
    const cutoff = (args.where as { createdAt: { lt: Date } }).createdAt.lt.getTime()
    expect(Date.now() - cutoff).toBeGreaterThanOrEqual(15 * 60_000 - 1000)
  })

  it('lets the uploader cancel their own upload that never completed', async () => {
    jest.mocked(db.csvImport.updateMany).mockResolvedValue({ count: 1 } as never)

    const result = await cancelCsvImport(user, 'imp-1')

    expect(result.status).toBe(200)
    expect(db.csvImport.updateMany).toHaveBeenCalledWith({
      where: { id: 'imp-1', organizationId: 'org-1', state: 'UPLOADING' },
      data: { state: 'FAILED', lastError: 'The upload was cancelled.' },
    })
  })

  it('refuses to cancel an import that is already importing or another workspace\'s', async () => {
    jest.mocked(db.csvImport.updateMany).mockResolvedValue({ count: 0 } as never)
    expect((await cancelCsvImport(user, 'imp-1')).status).toBe(409)
    expect((await cancelCsvImport(null, 'imp-1')).status).toBe(401)
  })
})
