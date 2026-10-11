/**
 * UNIT TEST: protections that matter against abuse and data mistakes.
 * - Exported CSV cells cannot run as spreadsheet formulas.
 * - Combined theme/sentiment/product-area filters all apply (they used to overwrite each other).
 * - Sign-in email limits key on a hashed, normalised address; only the email sign-in POST is IP-limited.
 * - The per-workspace daily feedback limit is configurable and counts from UTC midnight.
 */
import { classificationFilter, csvCell, submittedAtFilter } from '@/lib/feedback-filters'
import {
  DEFAULT_WORKSPACE_DAILY_ITEMS, isMagicLinkSignIn, magicLinkBucket, startOfUtcDay, workspaceDailyItemLimit,
} from '@/lib/abuse-limits'

describe('csvCell', () => {
  it.each(['=HYPERLINK("http://evil","x")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd'])('neutralises formula %p', (value) => {
    expect(csvCell(value).startsWith(`"'`)).toBe(true)
  })

  it('quotes, escapes quotes and flattens newlines', () => {
    expect(csvCell('He said "hi"\nthen left')).toBe('"He said ""hi"" then left"')
    expect(csvCell(null)).toBe('""')
    expect(csvCell(0.9)).toBe('"0.9"')
  })
})

describe('classificationFilter', () => {
  it('keeps every selected condition', () => {
    expect(classificationFilter({ theme: 'BUG_PROBLEM', sentiment: 'NEGATIVE', productArea: 'Billing' }))
      .toEqual({ is: { theme: 'BUG_PROBLEM', sentiment: 'NEGATIVE', productArea: 'Billing' } })
  })

  it('adds no condition when nothing is selected', () => {
    expect(classificationFilter({})).toBeUndefined()
  })
})

describe('submittedAtFilter', () => {
  it('combines both bounds instead of keeping only the last', () => {
    expect(submittedAtFilter('2026-10-01', '2026-10-05')).toEqual({ gte: new Date('2026-10-01'), lte: new Date('2026-10-05') })
    expect(submittedAtFilter(undefined, undefined)).toBeUndefined()
  })
})

describe('sign-in email limits', () => {
  it('treats address case and spacing as the same inbox and never stores the raw address', () => {
    expect(magicLinkBucket(' Victim@Example.com ')).toBe(magicLinkBucket('victim@example.com'))
    expect(magicLinkBucket('victim@example.com')).not.toContain('victim')
  })

  it('IP-limits only the email sign-in request', () => {
    expect(isMagicLinkSignIn('/api/auth/signin/nodemailer')).toBe(true)
    expect(isMagicLinkSignIn('/api/auth/callback/nodemailer')).toBe(false)
    expect(isMagicLinkSignIn('/api/auth/signin/google')).toBe(false)
  })
})

describe('workspace daily limit', () => {
  it('defaults safely and accepts a positive integer override', () => {
    expect(workspaceDailyItemLimit({})).toBe(DEFAULT_WORKSPACE_DAILY_ITEMS)
    expect(workspaceDailyItemLimit({ WORKSPACE_DAILY_ITEM_LIMIT: 'abc' })).toBe(DEFAULT_WORKSPACE_DAILY_ITEMS)
    expect(workspaceDailyItemLimit({ WORKSPACE_DAILY_ITEM_LIMIT: '-5' })).toBe(DEFAULT_WORKSPACE_DAILY_ITEMS)
    expect(workspaceDailyItemLimit({ WORKSPACE_DAILY_ITEM_LIMIT: '50' })).toBe(50)
  })

  it('counts from UTC midnight', () => {
    expect(startOfUtcDay(new Date('2026-10-11T23:59:59+05:30')).toISOString()).toBe('2026-10-11T00:00:00.000Z')
  })
})
