import Papa from 'papaparse'

export interface ParsedCsvRow {
  rawText: string
  submittedAt?: string
  submitterEmail?: string
  externalId?: string
}

export interface CsvColumnMapping {
  rawText: string        // CSV column name that maps to raw_text
  submittedAt?: string   // CSV column name for submitted_at
  submitterEmail?: string
  externalId?: string
}

export function detectCsvColumns(csvString: string): string[] {
  const result = Papa.parse<Record<string, string>>(csvString, {
    header: true,
    preview: 1,
  })
  return result.meta.fields?.map((f) => f.trim()) || []
}

export const MAX_CSV_ROWS = 2000
export const MAX_CSV_TEXT_CHARS = 50_000

export class CsvLimitError extends Error {
  constructor(message: string) { super(message); this.name = 'CsvLimitError' }
}

export class CsvFormatError extends Error {
  constructor(message: string) { super(message); this.name = 'CsvFormatError' }
}

export interface ValidatedCsvRow extends ParsedCsvRow {
  rowNumber: number // 1-based data row (header excluded); stable key for import deduplication
}

export interface ValidatedCsv {
  rows: ValidatedCsvRow[]
  errors: Array<{ row: number; reason: string }>
  totalRows: number
}

const normalizeColumn = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '_')
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Validates the whole file before anything is persisted: an over-limit or structurally broken file
// is rejected outright (never sliced); row-level problems are reported without blocking valid rows.
export function validateCsv(input: string | Buffer, mapping: CsvColumnMapping): ValidatedCsv {
  const csvString = Buffer.isBuffer(input) ? input.toString('utf-8') : input
  if (!csvString.trim()) throw new CsvFormatError('The CSV file is empty.')

  const parsed = Papa.parse<Record<string, string>>(csvString, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeColumn,
  })
  // A single-column file reports an undetectable delimiter yet parses correctly; only broken quoting is fatal.
  if (parsed.errors.some((error) => error.type === 'Quotes')) {
    throw new CsvFormatError('The CSV file is malformed (unbalanced quotes).')
  }

  const columns = {
    rawText: normalizeColumn(mapping.rawText),
    submittedAt: mapping.submittedAt ? normalizeColumn(mapping.submittedAt) : undefined,
    submitterEmail: mapping.submitterEmail ? normalizeColumn(mapping.submitterEmail) : undefined,
    externalId: mapping.externalId ? normalizeColumn(mapping.externalId) : undefined,
  }
  if (!parsed.meta.fields?.includes(columns.rawText)) {
    throw new CsvFormatError(`The CSV has no "${mapping.rawText}" column to read feedback text from.`)
  }

  const totalRows = parsed.data.length
  if (totalRows > MAX_CSV_ROWS) {
    throw new CsvLimitError(`The CSV has ${totalRows.toLocaleString('en-US')} rows; the limit is 2,000.`)
  }

  const rows: ValidatedCsvRow[] = []
  const errors: Array<{ row: number; reason: string }> = []
  parsed.data.forEach((record, index) => {
    const rowNumber = index + 1
    const rawText = record[columns.rawText]?.trim()
    const submittedAt = columns.submittedAt ? record[columns.submittedAt]?.trim() || undefined : undefined
    const submitterEmail = columns.submitterEmail ? record[columns.submitterEmail]?.trim() || undefined : undefined
    if (!rawText) return void errors.push({ row: rowNumber, reason: `Missing value for column "${mapping.rawText}"` })
    if (rawText.length > MAX_CSV_TEXT_CHARS) return void errors.push({ row: rowNumber, reason: 'Text exceeds 50,000 character limit' })
    if (submittedAt && Number.isNaN(Date.parse(submittedAt))) return void errors.push({ row: rowNumber, reason: `Invalid date "${submittedAt}"` })
    if (submitterEmail && !EMAIL.test(submitterEmail)) return void errors.push({ row: rowNumber, reason: 'Invalid email address' })
    rows.push({
      rowNumber,
      rawText,
      submittedAt,
      submitterEmail,
      externalId: columns.externalId ? record[columns.externalId]?.trim() || undefined : undefined,
    })
  })
  return { rows, errors, totalRows }
}
