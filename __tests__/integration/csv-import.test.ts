jest.mock('@/lib/dashboard-cache', () => ({ invalidateDashboard: jest.fn(), dashboardCacheKey: jest.fn() }))
/**
 * INTEGRATION TEST: completing a private-Blob CSV import is validated before any write, idempotent
 * across duplicate callbacks and crashes, and hands rows to the serverless classifier as staggered IDs.
 */
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { BULK_SLOT_SECONDS, MAX_CSV_BYTES, completeCsvImport, refreshCsvImportState, repairCsvImports } from '@/lib/imports/csv'

const databaseTests = process.env.TEST_DATABASE_URL && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL
  ? describe : describe.skip

databaseTests('completeCsvImport', () => {
  let organizationId: string
  let uploaderId: string

  const files = new Map<string, string>()
  const deps = {
    readBlob: jest.fn(async (pathname: string) => files.get(pathname) ?? ''),
    blobSize: jest.fn(async (pathname: string) => Buffer.byteLength(files.get(pathname) ?? '')),
    deleteBlob: jest.fn(async (pathname: string) => { files.delete(pathname) }),
    publish: jest.fn(async () => 'message-id') as jest.Mock,
  }

  async function startImport(csv: string) {
    await db.csvImport.updateMany({ where: { organizationId, state: { in: ['UPLOADING', 'IMPORTING', 'PROCESSING'] } }, data: { state: 'FAILED' } })
    const pathname = `imports/${organizationId}/${randomUUID()}.csv`
    files.set(pathname, csv)
    return db.csvImport.create({ data: {
      organizationId, uploaderId, blobPathname: pathname, columnMapping: { rawText: 'text', submittedAt: 'date' },
    } })
  }

  const blob = (pathname: string, csv: string) => ({ pathname, size: Buffer.byteLength(csv) })

  beforeAll(async () => {
    const organization = await db.organization.create({ data: { name: 'Import test', slug: `import-test-${randomUUID()}` } })
    const user = await db.user.create({ data: { email: `import-${randomUUID()}@example.test` } })
    organizationId = organization.id
    uploaderId = user.id
  })

  beforeEach(() => jest.clearAllMocks())

  afterAll(async () => {
    await db.organization.delete({ where: { id: organizationId } })
    await db.user.delete({ where: { id: uploaderId } })
    await db.$disconnect()
  })

  it('persists valid rows as pending bulk work, deletes the blob and publishes staggered IDs', async () => {
    const csv = 'text,date\nExports time out,2026-10-01\n,2026-10-01\nPlease add SSO,2026-10-02'
    const csvImport = await startImport(csv)

    await completeCsvImport(csvImport.id, blob(csvImport.blobPathname, csv), deps)

    const updated = await db.csvImport.findUniqueOrThrow({ where: { id: csvImport.id } })
    expect(updated).toMatchObject({ state: 'PROCESSING', totalRows: 3, importedRows: 2, invalidRows: 1 })
    const items = await db.feedbackItem.findMany({ where: { csvImportId: csvImport.id }, orderBy: { csvRowNumber: 'asc' } })
    expect(items.map((item) => [item.csvRowNumber, item.status, item.classificationDispatchKind, item.source]))
      .toEqual([[1, 'PENDING', 'BULK', 'CSV'], [3, 'PENDING', 'BULK', 'CSV']])
    expect(deps.deleteBlob).toHaveBeenCalledWith(csvImport.blobPathname)
    expect(deps.publish.mock.calls.map((call) => call[1])).toEqual([0, BULK_SLOT_SECONDS])
  })

  it('ignores a duplicate completion callback', async () => {
    const csv = 'text\nOne\nTwo'
    const csvImport = await startImport(csv)
    await completeCsvImport(csvImport.id, blob(csvImport.blobPathname, csv), deps)
    deps.publish.mockClear()

    await completeCsvImport(csvImport.id, blob(csvImport.blobPathname, csv), deps)

    expect(await db.feedbackItem.count({ where: { csvImportId: csvImport.id } })).toBe(2)
    expect(deps.publish).not.toHaveBeenCalled()
  })

  it('resumes after a crash mid-import without duplicating rows', async () => {
    const csv = 'text\nOne\nTwo\nThree'
    const csvImport = await startImport(csv)
    await db.csvImport.update({ where: { id: csvImport.id }, data: { state: 'IMPORTING' } })
    await db.feedbackItem.create({ data: {
      organizationId, source: 'CSV', rawText: 'One', submittedAt: new Date(),
      csvImportId: csvImport.id, csvRowNumber: 1, classificationDispatchKind: 'BULK',
    } })

    await completeCsvImport(csvImport.id, blob(csvImport.blobPathname, csv), deps)

    expect(await db.feedbackItem.count({ where: { csvImportId: csvImport.id } })).toBe(3)
    expect((await db.csvImport.findUniqueOrThrow({ where: { id: csvImport.id } })).importedRows).toBe(3)
  })

  it('fails an over-limit file with zero rows inserted and deletes the blob', async () => {
    const csv = ['text', ...Array.from({ length: 2001 }, (_, i) => `Row ${i}`)].join('\n')
    const csvImport = await startImport(csv)

    await completeCsvImport(csvImport.id, blob(csvImport.blobPathname, csv), deps)

    const updated = await db.csvImport.findUniqueOrThrow({ where: { id: csvImport.id } })
    expect(updated.state).toBe('FAILED')
    expect(updated.lastError).toContain('2,000')
    expect(await db.feedbackItem.count({ where: { csvImportId: csvImport.id } })).toBe(0)
    expect(deps.deleteBlob).toHaveBeenCalledWith(csvImport.blobPathname)
  })

  it('fails an import that would exceed the workspace daily limit, inserting nothing', async () => {
    process.env.WORKSPACE_DAILY_ITEM_LIMIT = '2'
    try {
      const csv = 'text\nOne\nTwo\nThree'
      const csvImport = await startImport(csv)

      await completeCsvImport(csvImport.id, blob(csvImport.blobPathname, csv), deps)

      const updated = await db.csvImport.findUniqueOrThrow({ where: { id: csvImport.id } })
      expect(updated.state).toBe('FAILED')
      expect(updated.lastError).toContain('daily limit 2')
      expect(await db.feedbackItem.count({ where: { csvImportId: csvImport.id } })).toBe(0)
      expect(deps.deleteBlob).toHaveBeenCalledWith(csvImport.blobPathname)
    } finally {
      delete process.env.WORKSPACE_DAILY_ITEM_LIMIT
    }
  })

  it('fails an oversized blob without reading it', async () => {
    const csvImport = await startImport('text\nhello')

    await completeCsvImport(csvImport.id, { pathname: csvImport.blobPathname, size: MAX_CSV_BYTES + 1 }, deps)

    expect((await db.csvImport.findUniqueOrThrow({ where: { id: csvImport.id } })).state).toBe('FAILED')
    expect(deps.readBlob).not.toHaveBeenCalled()
    expect(deps.deleteBlob).toHaveBeenCalledWith(csvImport.blobPathname)
  })

  it('rejects a blob path that does not belong to the import', async () => {
    const csvImport = await startImport('text\nhello')

    await expect(completeCsvImport(csvImport.id, { pathname: 'imports/someone-else.csv', size: 10 }, deps))
      .rejects.toThrow('does not belong')
    expect((await db.csvImport.findUniqueOrThrow({ where: { id: csvImport.id } })).state).toBe('UPLOADING')
    expect(deps.readBlob).not.toHaveBeenCalled()
  })

  it('marks the import completed once every row is finished, freeing the live slot', async () => {
    const csv = 'text\nOne'
    const csvImport = await startImport(csv)
    await completeCsvImport(csvImport.id, blob(csvImport.blobPathname, csv), deps)
    await refreshCsvImportState(csvImport.id)
    expect((await db.csvImport.findUniqueOrThrow({ where: { id: csvImport.id } })).state).toBe('PROCESSING')

    await db.feedbackItem.updateMany({ where: { csvImportId: csvImport.id }, data: { status: 'CLASSIFIED' } })
    await refreshCsvImportState(csvImport.id)

    const finished = await db.csvImport.findUniqueOrThrow({ where: { id: csvImport.id } })
    expect(finished.state).toBe('COMPLETED')
    expect(finished.completedAt).not.toBeNull()
  })

  it('repairs abandoned uploads, resumes stuck imports and closes finished ones', async () => {
    const hourAgo = new Date(Date.now() - 61 * 60_000)
    const otherOrg = await db.organization.create({ data: { name: 'Abandoned', slug: `abandoned-${randomUUID()}` } })
    const abandoned = await db.csvImport.create({ data: {
      organizationId: otherOrg.id, uploaderId, blobPathname: `imports/${otherOrg.id}/${randomUUID()}.csv`, columnMapping: { rawText: 'text' },
    } })
    await db.csvImport.update({ where: { id: abandoned.id }, data: { createdAt: hourAgo } })

    const stuckCsv = 'text\nAlpha\nBeta'
    const stuck = await startImport(stuckCsv)
    await db.csvImport.update({ where: { id: stuck.id }, data: { state: 'IMPORTING', updatedAt: hourAgo } })

    await repairCsvImports(new Date(), deps)

    const failed = await db.csvImport.findUniqueOrThrow({ where: { id: abandoned.id } })
    expect(failed.state).toBe('FAILED')
    expect(deps.deleteBlob).toHaveBeenCalledWith(abandoned.blobPathname)
    expect((await db.csvImport.findUniqueOrThrow({ where: { id: stuck.id } })).state).toBe('PROCESSING')
    expect(await db.feedbackItem.count({ where: { csvImportId: stuck.id } })).toBe(2)

    await db.feedbackItem.updateMany({ where: { csvImportId: stuck.id }, data: { status: 'CLASSIFIED' } })
    await repairCsvImports(new Date(), deps)
    expect((await db.csvImport.findUniqueOrThrow({ where: { id: stuck.id } })).state).toBe('COMPLETED')
    await db.organization.delete({ where: { id: otherOrg.id } })
  })
})
