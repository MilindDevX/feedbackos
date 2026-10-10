'use client'

import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { upload } from '@vercel/blob/client'
import { Upload, FileText, X, Loader2, CheckCircle2, AlertCircle, Send, ChevronRight } from 'lucide-react'
import { detectCsvColumns } from '@/lib/integrations/csv'

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
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Ingest Feedback</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upload a CSV or submit feedback manually — AI classification starts automatically</p>
      </div>

      {/* CSV Upload */}
      <section className="glass-card p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-white">Bulk CSV Upload</h2>
          <p className="text-sm text-gray-500 mt-0.5">Up to 2,000 rows and 20 MiB per CSV. On the free AI tier, classification runs gradually — about 14 hours for 2,000 rows.</p>
        </div>

        {step === 'idle' && (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
              isDragActive
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/30'
            }`}
          >
            <input {...getInputProps({ 'aria-label': 'Choose a CSV file to import' })} />
            <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragActive ? 'text-brand-400' : 'text-gray-600'}`} />
            <p className="text-gray-300 font-medium">
              {isDragActive ? 'Drop your CSV here' : 'Drag & drop your CSV file'}
            </p>
            <p className="text-gray-500 text-sm mt-1">or click to browse</p>
            <p className="text-gray-600 text-xs mt-3">Accepted: .csv up to 20 MiB | You choose the feedback text column next</p>
          </div>
        )}

        {step === 'mapping' && file && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/60 border border-gray-700">
              <FileText className="w-5 h-5 text-brand-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB · {detectedColumns.length} columns detected</p>
              </div>
              <button onClick={resetUpload} aria-label="Remove file and start over" className="text-gray-500 hover:text-gray-300">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-300">Map your columns</p>
              {[
                { key: 'rawText', label: 'Feedback text *', required: true },
                { key: 'submittedAt', label: 'Date submitted' },
                { key: 'submitterEmail', label: 'Submitter email' },
              ].map(({ key, label, required }) => (
                <div key={key} className="flex items-center gap-3">
                  <label htmlFor={`csv-column-${key}`} className="w-36 text-xs text-gray-400 flex-shrink-0">{label}</label>
                  <select
                    id={`csv-column-${key}`}
                    value={mapping[key as keyof ColumnMapping]}
                    onChange={(e) => setMapping(m => ({ ...m, [key]: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="">{required ? '— select column —' : 'Skip'}</option>
                    {detectedColumns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <button
              onClick={handleUpload}
              disabled={!mapping.rawText}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Upload & Classify
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 'uploading' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
            <p className="text-gray-300 text-sm">Uploading privately… {uploadProgress}%</p>
            <div className="w-full max-w-xs h-1.5 rounded-full bg-gray-800 overflow-hidden" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
              <div className="h-full bg-brand-500 transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="space-y-4">
            {!importStatus || importStatus.state === 'UPLOADING' || importStatus.state === 'IMPORTING' ? (
              <div className="flex items-center gap-2 p-4 rounded-lg bg-gray-800/60 border border-gray-700 text-sm text-gray-300">
                <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
                Upload received — importing rows…
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <p className="text-green-400 font-medium text-sm">
                    {importStatus.importedRows.toLocaleString()} of {(importStatus.totalRows ?? 0).toLocaleString()} rows imported
                  </p>
                </div>
                {importStatus.invalidRows > 0 && (
                  <p className="text-amber-400 text-xs mt-1">{importStatus.invalidRows.toLocaleString()} rows skipped (empty text, bad date or email)</p>
                )}
              </div>
            )}

            {importStatus && importStatus.state === 'PROCESSING' && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Classification progress for this import (updates every 5s; safe to close this tab)</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Waiting', value: importStatus.queued, color: 'text-gray-400' },
                    { label: 'Classified', value: importStatus.classified, color: 'text-green-400' },
                    { label: 'Needs review', value: importStatus.needsReview, color: 'text-amber-400' },
                    { label: 'Failed', value: importStatus.failed, color: 'text-red-400' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="p-3 rounded-lg bg-gray-800 text-center">
                      <p className={`text-xl font-bold ${color}`}>{value.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="text-center space-y-3 py-4">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
            <p className="text-white font-semibold">Import finished</p>
            <p className="text-gray-400 text-sm">Every imported row has been classified; low-confidence ones are waiting in review.</p>
            <div className="flex gap-3 justify-center">
              <a href="/feedback" className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm transition-colors">
                View Feedback →
              </a>
              <button onClick={resetUpload} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm transition-colors">
                Upload Another
              </button>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <p className="text-red-400 text-sm">{uploadError}</p>
            </div>
            <button onClick={resetUpload} className="mt-2 text-xs text-gray-500 hover:text-gray-300">
              Try again
            </button>
          </div>
        )}
      </section>

      {/* Manual Entry */}
      <section id="manual" className="glass-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white">Manual Entry</h2>
          <p className="text-sm text-gray-500 mt-0.5">Submit a single feedback item for immediate classification</p>
        </div>

        <form onSubmit={handleManualSubmit} className="space-y-3">
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Paste or type customer feedback here…"
            rows={5}
            required
            minLength={10}
            className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-800 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none transition-all text-sm leading-relaxed"
          />

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">{manualText.length}/50,000 characters</span>
            <button
              type="submit"
              disabled={manualLoading || manualText.length < 10}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {manualLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Submit & Classify
            </button>
          </div>

          {manualSuccess && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <p className="text-green-400 text-sm">Submitted! AI classification will complete in ~2 seconds.</p>
            </div>
          )}
          {manualError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <p className="text-red-400 text-sm">{manualError}</p>
            </div>
          )}
        </form>
      </section>
    </div>
  )
}
