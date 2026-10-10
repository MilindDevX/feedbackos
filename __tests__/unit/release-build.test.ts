/**
 * UNIT TEST: the Vercel build applies migrations to production only, through a direct Neon connection,
 * and only after the application has built.
 */
import { buildSteps, directDatabaseUrl } from '@/lib/release-build'

describe('directDatabaseUrl', () => {
  it('turns a Neon pooler URL into the direct endpoint with a wake-up timeout', () => {
    expect(directDatabaseUrl('postgresql://u:p@ep-x-123-pooler.us-west-2.aws.neon.tech/db?sslmode=require&pgbouncer=true'))
      .toBe('postgresql://u:p@ep-x-123.us-west-2.aws.neon.tech/db?sslmode=require&connect_timeout=30')
  })

  it('keeps a direct URL direct', () => {
    expect(directDatabaseUrl('postgresql://u:p@localhost:5432/db')).toBe('postgresql://u:p@localhost:5432/db?connect_timeout=30')
  })

  it('refuses a missing or malformed URL', () => {
    expect(() => directDatabaseUrl(undefined)).toThrow('DATABASE_URL')
    expect(() => directDatabaseUrl('not a url')).toThrow('DATABASE_URL')
  })
})

describe('buildSteps', () => {
  it('builds, then migrates, on production', () => {
    expect(buildSteps({ VERCEL_ENV: 'production' })).toEqual(['build', 'migrate'])
  })

  it('never migrates previews (they share the production database) or local builds', () => {
    expect(buildSteps({ VERCEL_ENV: 'preview' })).toEqual(['build'])
    expect(buildSteps({})).toEqual(['build'])
  })
})
