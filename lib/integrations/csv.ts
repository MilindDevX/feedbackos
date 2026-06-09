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

export interface CsvParseResult {
  rows: ParsedCsvRow[]
  errors: Array<{ row: number; reason: string }>
  totalRows: number
}

export function parseCsvBuffer(
  buffer: string | Buffer,
  columnMapping: CsvColumnMapping,
  maxRows = 500
): CsvParseResult {
  const csvString = Buffer.isBuffer(buffer) ? buffer.toString('utf-8') : buffer

  const result = Papa.parse<Record<string, string>>(csvString, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  const rows: ParsedCsvRow[] = []
  const errors: Array<{ row: number; reason: string }> = []

  const normalizedMapping: CsvColumnMapping = {
    rawText: columnMapping.rawText.toLowerCase().replace(/\s+/g, '_'),
    submittedAt: columnMapping.submittedAt?.toLowerCase().replace(/\s+/g, '_'),
    submitterEmail: columnMapping.submitterEmail?.toLowerCase().replace(/\s+/g, '_'),
    externalId: columnMapping.externalId?.toLowerCase().replace(/\s+/g, '_'),
  }

  const slicedData = result.data.slice(0, maxRows)

  slicedData.forEach((row, index) => {
    const rawText = row[normalizedMapping.rawText]?.trim()
    if (!rawText) {
      errors.push({ row: index + 2, reason: `Missing value for column "${normalizedMapping.rawText}"` })
      return
    }
    if (rawText.length > 50000) {
      errors.push({ row: index + 2, reason: 'Text exceeds 50,000 character limit' })
      return
    }

    rows.push({
      rawText,
      submittedAt: normalizedMapping.submittedAt ? row[normalizedMapping.submittedAt]?.trim() : undefined,
      submitterEmail: normalizedMapping.submitterEmail ? row[normalizedMapping.submitterEmail]?.trim() : undefined,
      externalId: normalizedMapping.externalId ? row[normalizedMapping.externalId]?.trim() : undefined,
    })
  })

  return {
    rows,
    errors,
    totalRows: result.data.length,
  }
}

export function detectCsvColumns(csvString: string): string[] {
  const result = Papa.parse<Record<string, string>>(csvString, {
    header: true,
    preview: 1,
  })
  return result.meta.fields?.map((f) => f.trim()) || []
}
