/**
 * INTEGRATION TEST: database constraints for durable CSV imports — one live import per organization
 * and no duplicate feedback rows from the same import row.
 */
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'

const databaseTests = process.env.TEST_DATABASE_URL && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL
  ? describe : describe.skip

databaseTests('CSV import constraints', () => {
  let organizationId: string
  let otherOrganizationId: string
  let uploaderId: string

  const liveImport = (orgId: string) => ({
    organizationId: orgId,
    uploaderId,
    state: 'UPLOADING' as const,
    blobPathname: `imports/${randomUUID()}.csv`,
    columnMapping: { rawText: 'text' },
  })

  beforeAll(async () => {
    const [organization, other, user] = await Promise.all([
      db.organization.create({ data: { name: 'CSV test', slug: `csv-test-${randomUUID()}` } }),
      db.organization.create({ data: { name: 'CSV other', slug: `csv-other-${randomUUID()}` } }),
      db.user.create({ data: { email: `csv-${randomUUID()}@example.test` } }),
    ])
    organizationId = organization.id
    otherOrganizationId = other.id
    uploaderId = user.id
  })

  afterAll(async () => {
    await db.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } })
    await db.user.delete({ where: { id: uploaderId } })
    await db.$disconnect()
  })

  it('allows only one live import per organization under concurrent starts', async () => {
    const results = await Promise.allSettled([
      db.csvImport.create({ data: liveImport(organizationId) }),
      db.csvImport.create({ data: liveImport(organizationId) }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  })

  it('lets another organization start its own import', async () => {
    await expect(db.csvImport.create({ data: liveImport(otherOrganizationId) })).resolves.toBeDefined()
  })

  it('allows a new import once the previous one is finished', async () => {
    await db.csvImport.updateMany({ where: { organizationId }, data: { state: 'COMPLETED' } })
    await expect(db.csvImport.create({ data: liveImport(organizationId) })).resolves.toBeDefined()
  })

  it('rejects a second feedback item for the same import row', async () => {
    const csvImport = await db.csvImport.findFirstOrThrow({ where: { organizationId, state: 'UPLOADING' } })
    const row = {
      organizationId, source: 'CSV' as const, rawText: 'Row one', submittedAt: new Date(),
      csvImportId: csvImport.id, csvRowNumber: 1,
    }
    await db.feedbackItem.create({ data: row })
    await expect(db.feedbackItem.create({ data: row })).rejects.toThrow()
  })
})
