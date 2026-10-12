'use client'

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { upload } from '@vercel/blob/client'
import Link from 'next/link'
import { Upload, FileText, X, Loader2, CheckCircle2, ArrowRight } from 'lucide-react'
import { Notice, PageHeader, Panel, buttonClass, inputClass } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { detectCsvColumns } from '@/lib/integrations/csv'
import { useSession } from 'next-auth/react'
import { canWrite } from '@/lib/permissions'

const MAX_CSV_BYTES = 20 * 1024 * 1024
const ACTIVE_IMPORT_KEY = 'feedbackos.activeCsvImport'

interface ImportStatus {
  state: 'UPLOADING' | 'IMPORTING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  totalRows: number | null
  importedRows: number
  invalidRows: number
  lastError: string | null
  queued: number
  classified: number
  needsReview: number
  failed: number
}

interface ColumnMapping {
  rawText: string
  submittedAt: string
  submitterEmail: string
}

type UploadStep = 'idle' | 'mapping' | 'uploading' | 'processing' | 'done' | 'error'

const readStoredImport = () => { try { return localStorage.getItem(ACTIVE_IMPORT_KEY) } catch { return null } }
const subscribeToNothing = () => () => {}
const storeImport = (id: string | null) => {
  try { if (id) localStorage.setItem(ACTIVE_IMPORT_KEY, id); else localStorage.removeItem(ACTIVE_IMPORT_KEY) } catch { /* private mode */ }
}

export default function IngestPage() {
  const { data: session, status: sessionStatus } = useSession()
  const readOnly = sessionStatus === 'authenticated' && !canWrite(session?.user as { role?: string } | undefined)
  // Manual entry state
  const [manualText, setManualText] = useState('')
  const [manualLoading, setManualLoading] = useState(false)
  const [manualSuccess, setManualSuccess] = useState(false)
  const [manualError, setManualError] = useState('')

  // CSV import state
  const [file, setFile] = useState<File | null>(null)
  const [detectedColumns, setDetectedColumns] = useState<string[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({ rawText: '', submittedAt: '', submitterEmail: '' })
  const [uploadStep, setUploadStep] = useState<UploadStep>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [importId, setImportId] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Resume an import that is still running after a reload or a closed tab (null during server render).
  const storedImportId = useSyncExternalStore(subscribeToNothing, readStoredImport, () => null)
  const activeImportId = importId ?? storedImportId
  const step: UploadStep = uploadStep === 'idle' && storedImportId ? 'processing' : uploadStep

  // Poll this import's own status; finishing the upload does not mean classification is done.
  useEffect(() => {
    if (step !== 'processing' || !activeImportId) return
    const poll = async () => {
      const res = await fetch(`/api/feedback/imports/${activeImportId}`)
      if (res.status === 404) { storeImport(null); setUploadStep('idle'); return }
      if (!res.ok) return
      const status: ImportStatus = await res.json()
      setImportStatus(status)
      if (status.state === 'COMPLETED' || status.state === 'FAILED') {
        storeImport(null)
        if (status.state === 'FAILED') { setUploadError(status.lastError || 'The import failed.'); setUploadStep('error') }
        else setUploadStep('done')
      }
    }
    poll()
    pollingRef.current = setInterval(poll, 5000)
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [step, activeImportId])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const f = acceptedFiles[0]
    if (!f) return
    setFile(f)
    setUploadStep('mapping')
    setUploadError('')
    // Headers are read in the browser; the file itself goes straight to private storage later.
    const cols = detectCsvColumns(await f.slice(0, 64 * 1024).text())
    setDetectedColumns(cols)
    const textCol = cols.find(c => /text|feedback|content|body|message/i.test(c)) || cols[0] || ''
    const dateCol = cols.find(c => /date|time|created|submitted/i.test(c)) || ''
    const emailCol = cols.find(c => /email|mail/i.test(c)) || ''
    setMapping({ rawText: textCol, submittedAt: dateCol, submitterEmail: emailCol })
  }, [])

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    const code = rejections[0]?.errors[0]?.code
    setUploadError(code === 'file-too-large' ? 'That file is larger than 20 MiB.' : 'Choose a single .csv file.')
    setUploadStep('error')
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    maxSize: MAX_CSV_BYTES,
  })

  const handleUpload = async () => {
    if (!file || !mapping.rawText) return
    setUploadStep('uploading')
    setUploadProgress(0)
    setUploadError('')

    const columnMapping = Object.fromEntries(Object.entries(mapping).filter(([, column]) => column))
    const start = await fetch('/api/feedback/imports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columnMapping }),
    })
    const started = await start.json()
    if (!start.ok) {
      setUploadError(started.error || 'The import could not be started.')
      setUploadStep('error')
      return
    }

    try {
      await upload(started.pathname, file, {
        access: 'private',
        handleUploadUrl: '/api/feedback/imports/blob',
        clientPayload: JSON.stringify({ importId: started.importId }),
        contentType: 'text/csv',
        multipart: file.size > 5 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setUploadProgress(Math.round(percentage)),
      })
    } catch {
      // Release the workspace's single live-import slot so the user can retry right away.
      await fetch(`/api/feedback/imports/${started.importId}/cancel`, { method: 'POST' }).catch(() => undefined)
      setUploadError('The upload was interrupted. Please try again.')
      setUploadStep('error')
      return
    }
    storeImport(started.importId)
    setImportId(started.importId)
    setUploadStep('processing')
  }

  const resetUpload = () => {
    storeImport(null)
    setFile(null)
    setDetectedColumns([])
    setMapping({ rawText: '', submittedAt: '', submitterEmail: '' })
    setUploadStep('idle')
    setUploadProgress(0)
    setUploadError('')
    setImportId(null)
    setImportStatus(null)
  }

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualText.trim()) return
    setManualLoading(true)
    setManualError('')
    setManualSuccess(false)

    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'manual', raw_text: manualText }),
    })
    const json = await res.json()

    if (!res.ok) {
      setManualError(json.error || 'Submission failed')
    } else {
      setManualSuccess(true)
      setManualText('')
      setTimeout(() => setManualSuccess(false), 4000)
    }
    setManualLoading(false)
  }

  return (
    <>
      <PageHeader title="Ingest" description="Import a CSV or add one item. Classification starts on its own." />
      {readOnly && <div className="mb-6"><Notice tone="info">This workspace is view-only, so importing and adding feedback are turned off.</Notice></div>}

      <fieldset disabled={readOnly} className={cn('grid gap-6 lg:grid-cols-5 items-start min-w-0', readOnly && 'opacity-60 pointer-events-none')}>
        <Panel className="p-5 sm:p-6 lg:col-span-3">
          <h2 className="font-display text-base font-semibold text-ink">Import a CSV</h2>
          <p className="mt-1 text-sm text-ink-3">Up to 2,000 rows and 20 MiB. On the free AI tier, large files classify gradually (about 14 hours for 2,000 rows).</p>

          <div className="mt-5">
            {step === 'idle' && (
              <div
                {...getRootProps()}
                className={cn(
                  'rounded-lg border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-colors',
                  isDragActive ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-accent hover:bg-hover'
                )}
              >
                <input {...getInputProps({ 'aria-label': 'Choose a CSV file to import' })} />
                <Upload className={cn('w-7 h-7 mx-auto', isDragActive ? 'text-accent' : 'text-ink-3')} aria-hidden="true" />
                <p className="mt-3 font-medium text-ink">{isDragActive ? 'Drop it here' : 'Drop a CSV here, or click to choose'}</p>
                <p className="mt-1 text-xs text-ink-3">You pick the feedback column next. Nothing is imported until you confirm.</p>
              </div>
            )}

            {step === 'mapping' && file && (
              <div className="space-y-5">
                <div className="flex items-center gap-3 rounded-lg bg-sunken px-3 py-2.5">
                  <FileText className="w-5 h-5 text-accent flex-shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{file.name}</p>
                    <p className="text-xs text-ink-3">{(file.size / 1024).toFixed(1)} KB · {detectedColumns.length} columns detected</p>
                  </div>
                  <button onClick={resetUpload} aria-label="Remove file and start over" className="w-8 h-8 rounded-md flex items-center justify-center text-ink-3 hover:text-ink hover:bg-hover">
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium text-ink mb-1">Match your columns</legend>
                  {[
                    { key: 'rawText', label: 'Feedback text', required: true },
                    { key: 'submittedAt', label: 'Date submitted' },
                    { key: 'submitterEmail', label: 'Submitter email' },
                  ].map(({ key, label, required }) => (
                    <div key={key} className="grid gap-1.5 sm:grid-cols-[9rem_1fr] sm:items-center sm:gap-3">
                      <label htmlFor={`csv-column-${key}`} className="text-sm text-ink-2">
                        {label}{required && <span className="text-danger" aria-hidden="true"> *</span>}
                      </label>
                      <select
                        id={`csv-column-${key}`}
                        name={key}
                        value={mapping[key as keyof ColumnMapping]}
                        onChange={(e) => setMapping(m => ({ ...m, [key]: e.target.value }))}
                        required={required}
                        className={inputClass}
                      >
                        <option value="">{required ? 'Select a column' : 'Skip'}</option>
                        {detectedColumns.map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                    </div>
                  ))}
                </fieldset>

                <button onClick={handleUpload} disabled={!mapping.rawText} className={buttonClass('primary', 'md', 'w-full h-10')}>
                  Upload &amp; Classify <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {step === 'uploading' && (
              <div className="py-8 text-center">
                <Loader2 className="w-6 h-6 text-accent animate-spin mx-auto" aria-hidden="true" />
                <p className="mt-3 text-sm text-ink-2 tabular">Uploading privately… {uploadProgress}%</p>
                <div className="mt-3 mx-auto max-w-xs h-1.5 rounded-full bg-sunken overflow-hidden" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
                  <div className="h-full bg-accent transition-[width]" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}

            {step === 'processing' && (
              <div className="space-y-4">
                {!importStatus || importStatus.state === 'UPLOADING' || importStatus.state === 'IMPORTING' ? (
                  <Notice tone="info"><Loader2 className="w-4 h-4 animate-spin mt-0.5" aria-hidden="true" />Upload received. Importing rows…</Notice>
                ) : (
                  <Notice tone="success">
                    <CheckCircle2 className="w-4 h-4 mt-0.5" aria-hidden="true" />
                    <span>
                      {importStatus.importedRows.toLocaleString()} of {(importStatus.totalRows ?? 0).toLocaleString()} rows imported
                      {importStatus.invalidRows > 0 && <span className="block text-xs opacity-80">{importStatus.invalidRows.toLocaleString()} rows skipped (empty text, bad date or email)</span>}
                    </span>
                  </Notice>
                )}

                {importStatus && importStatus.state === 'PROCESSING' && (
                  <div>
                    <p className="text-xs text-ink-3 mb-2">Classification progress for this import. Updates every 5 seconds; you can close this tab.</p>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 rounded-lg border border-line divide-x divide-y sm:divide-y-0 divide-line">
                      {[
                        { label: 'Waiting', value: importStatus.queued },
                        { label: 'Classified', value: importStatus.classified },
                        { label: 'Needs review', value: importStatus.needsReview },
                        { label: 'Failed', value: importStatus.failed },
                      ].map(({ label, value }) => (
                        <div key={label} className="px-3 py-3">
                          <dt className="text-xs text-ink-3">{label}</dt>
                          <dd className="font-display text-xl font-semibold text-ink tabular">{value.toLocaleString()}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </div>
            )}

            {step === 'done' && (
              <div className="py-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-success mx-auto" aria-hidden="true" />
                <p className="mt-3 font-display text-lg font-semibold text-ink">Import finished</p>
                <p className="mt-1 text-sm text-ink-2">Every row is classified; low-confidence ones are waiting in review.</p>
                <div className="mt-5 flex gap-2 justify-center">
                  <Link href="/feedback" className={buttonClass('primary')}>View feedback</Link>
                  <button onClick={resetUpload} className={buttonClass('secondary')}>Upload another</button>
                </div>
              </div>
            )}

            {step === 'error' && (
              <div className="space-y-3">
                <Notice tone="error">{uploadError}</Notice>
                <button onClick={resetUpload} className={buttonClass('secondary', 'sm')}>Try again</button>
              </div>
            )}
          </div>
        </Panel>

        <Panel id="manual" className="p-5 sm:p-6 lg:col-span-2 scroll-mt-6">
          <h2 className="font-display text-base font-semibold text-ink">Add one item</h2>
          <p className="mt-1 text-sm text-ink-3">Paste a message, review or ticket. It is classified in a few seconds.</p>

          <form onSubmit={handleManualSubmit} className="mt-5 space-y-3">
            <label htmlFor="manual-feedback" className="sr-only">Feedback text</label>
            <textarea
              id="manual-feedback"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Paste or type customer feedback here…"
              rows={7}
              required
              minLength={10}
              className={cn(inputClass, 'resize-y leading-relaxed')}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-ink-3 tabular">{manualText.length.toLocaleString()} / 50,000</span>
              <button type="submit" disabled={manualLoading || manualText.length < 10} className={buttonClass('primary')}>
                {manualLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                Submit &amp; Classify
              </button>
            </div>
            {manualSuccess && <Notice tone="success"><CheckCircle2 className="w-4 h-4 mt-0.5" aria-hidden="true" />Added. It will show up classified in Feedback in a few seconds.</Notice>}
            {manualError && <Notice tone="error">{manualError}</Notice>}
          </form>
        </Panel>
      </fieldset>
    </>
  )
}
