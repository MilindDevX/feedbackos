/**
 * UNIT TEST: strict CSV validation maps user-defined columns and rejects unsafe files before import
 */

import { detectCsvColumns, validateCsv, CsvLimitError, CsvFormatError } from '@/lib/integrations/csv'

describe('validateCsv – column mapping', () => {
  it('maps a simple CSV with default column name "text"', () => {
    const csv = `text,date\n"Great product!",2024-01-01\n"Needs improvement",2024-01-02`
    const { rows, errors } = validateCsv(csv, { rawText: 'text' })
    expect(errors).toHaveLength(0)
    expect(rows.map((row) => row.rawText)).toEqual(['Great product!', 'Needs improvement'])
  })

  it('maps user-defined column name (e.g. "feedback_body") to rawText', () => {
    const csv = `feedback_body,email\n"The login is broken",user@test.com`
    const { rows, errors } = validateCsv(csv, { rawText: 'feedback_body', submitterEmail: 'email' })
    expect(errors).toHaveLength(0)
    expect(rows[0]).toMatchObject({ rawText: 'The login is broken', submitterEmail: 'user@test.com' })
  })

  it('handles column names with spaces by normalizing them', () => {
    const csv = `"Feedback Body",Submitted At\n"Works great!",2024-03-01`
    const { rows, errors } = validateCsv(csv, { rawText: 'Feedback Body', submittedAt: 'Submitted At' })
    expect(errors).toHaveLength(0)
    expect(rows[0]).toMatchObject({ rawText: 'Works great!', submittedAt: '2024-03-01' })
  })
})

describe('detectCsvColumns', () => {
  it('extracts column names from CSV header', () => {
    const csv = `text,email,date,external_id\n"value","a@b.com","2024-01-01","EXT-1"`
    const columns = detectCsvColumns(csv)
    expect(columns).toEqual(['text', 'email', 'date', 'external_id'])
  })
})

describe('validateCsv – strict import validation', () => {
  const csvWithRows = (count: number) =>
    ['text', ...Array.from({ length: count }, (_, i) => `Feedback number ${i + 1}`)].join('\n')

  it('accepts exactly 2,000 data rows with 1-based row numbers', () => {
    const result = validateCsv(csvWithRows(2000), { rawText: 'text' })
    expect(result.totalRows).toBe(2000)
    expect(result.rows).toHaveLength(2000)
    expect(result.rows[0]).toMatchObject({ rowNumber: 1, rawText: 'Feedback number 1' })
  })

  it('rejects 2,001 rows outright instead of silently slicing', () => {
    expect(() => validateCsv(csvWithRows(2001), { rawText: 'text' })).toThrow(CsvLimitError)
    expect(() => validateCsv(csvWithRows(2001), { rawText: 'text' })).toThrow('2,000')
  })

  it('rejects an empty file and a file without the mapped text column', () => {
    expect(() => validateCsv('', { rawText: 'text' })).toThrow(CsvFormatError)
    expect(() => validateCsv('body\nhello', { rawText: 'text' })).toThrow('"text"')
  })

  it('rejects malformed CSV structure', () => {
    expect(() => validateCsv('text,email\n"unterminated quote,a@b.co\nnext,row', { rawText: 'text' }))
      .toThrow(CsvFormatError)
  })

  it('reports row-level problems with their row numbers and keeps valid rows', () => {
    const csv = [
      'text,date,email',
      'Good row,2026-10-01,a@example.com',
      ',2026-10-01,b@example.com',
      'Bad date,not-a-date,c@example.com',
      'Bad email,2026-10-01,not-an-email',
      `${'x'.repeat(50_001)},2026-10-01,d@example.com`,
    ].join('\n')

    const result = validateCsv(csv, { rawText: 'text', submittedAt: 'date', submitterEmail: 'email' })

    expect(result.rows.map((row) => row.rowNumber)).toEqual([1])
    expect(result.errors.map((error) => error.row)).toEqual([2, 3, 4, 5])
    expect(result.totalRows).toBe(5)
  })
})
