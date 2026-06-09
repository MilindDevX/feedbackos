/**
 * UNIT TEST: CSV parser correctly maps user-defined column names to internal schema
 */

import { parseCsvBuffer, detectCsvColumns } from '@/lib/integrations/csv'

describe('parseCsvBuffer – column mapping', () => {
  it('maps a simple CSV with default column name "text"', () => {
    const csv = `text,date\n"Great product!",2024-01-01\n"Needs improvement",2024-01-02`
    const { rows, errors } = parseCsvBuffer(csv, { rawText: 'text' })
    expect(errors).toHaveLength(0)
    expect(rows).toHaveLength(2)
    expect(rows[0].rawText).toBe('Great product!')
    expect(rows[1].rawText).toBe('Needs improvement')
  })

  it('maps user-defined column name (e.g. "feedback_body") to rawText', () => {
    const csv = `feedback_body,email\n"The login is broken",user@test.com`
    const { rows, errors } = parseCsvBuffer(csv, { rawText: 'feedback_body', submitterEmail: 'email' })
    expect(errors).toHaveLength(0)
    expect(rows[0].rawText).toBe('The login is broken')
    expect(rows[0].submitterEmail).toBe('user@test.com')
  })

  it('handles column names with spaces by normalizing them', () => {
    const csv = `"Feedback Body",Submitted At\n"Works great!",2024-03-01`
    const { rows, errors } = parseCsvBuffer(csv, { rawText: 'Feedback Body', submittedAt: 'Submitted At' })
    expect(errors).toHaveLength(0)
    expect(rows[0].rawText).toBe('Works great!')
    expect(rows[0].submittedAt).toBe('2024-03-01')
  })

  it('returns error and skips rows where mapped rawText column is empty', () => {
    const csv = `body,date\n"Valid feedback",2024-01-01\n,2024-01-02`
    const { rows, errors, totalRows } = parseCsvBuffer(csv, { rawText: 'body' })
    expect(rows).toHaveLength(1)
    expect(errors).toHaveLength(1)
    expect(errors[0].row).toBe(3) // row 1 = header, row 2 = valid, row 3 = invalid
    expect(totalRows).toBe(2)
  })

  it('enforces maxRows limit correctly', () => {
    const header = 'text'
    const dataRows = Array.from({ length: 600 }, (_, i) => `"Row ${i + 1}"`).join('\n')
    const csv = `${header}\n${dataRows}`
    const { rows, totalRows } = parseCsvBuffer(csv, { rawText: 'text' }, 500)
    expect(rows).toHaveLength(500)
    expect(totalRows).toBe(600)
  })

  it('returns graceful error when rawText column does not exist in CSV', () => {
    const csv = `feedback,date\n"Some text",2024-01-01`
    // Mapping references a column "body" that does not exist
    const { rows, errors } = parseCsvBuffer(csv, { rawText: 'body' })
    expect(rows).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].reason).toContain('body')
  })
})

describe('detectCsvColumns', () => {
  it('extracts column names from CSV header', () => {
    const csv = `text,email,date,external_id\n"value","a@b.com","2024-01-01","EXT-1"`
    const columns = detectCsvColumns(csv)
    expect(columns).toEqual(['text', 'email', 'date', 'external_id'])
  })
})
