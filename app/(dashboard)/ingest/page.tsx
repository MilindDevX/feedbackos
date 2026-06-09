'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, X, Loader2, CheckCircle2, AlertCircle, Send, ChevronRight } from 'lucide-react'

interface QueueStatus {
  pending: number
  classifying: number
  needsReview: number
  total: number
}

interface ColumnMapping {
  rawText: string
  submittedAt: string
  submitterEmail: string
}

type UploadStep = 'idle' | 'mapping' | 'uploading' | 'processing' | 'done' | 'error'

export default function IngestPage() {
  // Manual entry state
  const [manualText, setManualText] = useState('')
  const [manualLoading, setManualLoading] = useState(false)
  const [manualSuccess, setManualSuccess] = useState(false)
  const [manualError, setManualError] = useState('')

  // CSV upload state
  const [file, setFile] = useState<File | null>(null)
  const [detectedColumns, setDetectedColumns] = useState<string[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({ rawText: '', submittedAt: '', submitterEmail: '' })
  const [uploadStep, setUploadStep] = useState<UploadStep>('idle')
  const [uploadResult, setUploadResult] = useState<{ itemsQueued: number; errors: Array<{ row: number; reason: string }> } | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Poll queue status during processing
  useEffect(() => {
    if (uploadStep === 'processing') {
      pollingRef.current = setInterval(async () => {
        const res = await fetch('/api/feedback/queue-status')
        const json = await res.json()
        setQueueStatus(json.data)
        if (json.data.pending === 0 && json.data.classifying === 0) {
          setUploadStep('done')
          clearInterval(pollingRef.current!)
        }
      }, 3000)
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [uploadStep])

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const f = acceptedFiles[0]
    if (!f) return
    setFile(f)
    setUploadStep('mapping')
    setUploadError('')

    // Detect columns
    const formData = new FormData()
    formData.append('file', f)
    formData.append('detectColumns', 'true')
    const res = await fetch('/api/feedback/upload', { method: 'POST', body: formData })
    const json = await res.json()
    const cols: string[] = json.data?.columns || []
    setDetectedColumns(cols)
    // Auto-map common column names
    const textCol = cols.find(c => /text|feedback|content|body|message/i.test(c)) || cols[0] || ''
    const dateCol = cols.find(c => /date|time|created|submitted/i.test(c)) || ''
    const emailCol = cols.find(c => /email|mail/i.test(c)) || ''
    setMapping({ rawText: textCol, submittedAt: dateCol, submitterEmail: emailCol })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  })

  const handleUpload = async () => {
    if (!file || !mapping.rawText) return
    setUploadStep('uploading')
    setUploadError('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('columnMapping', JSON.stringify(mapping))

    const res = await fetch('/api/feedback/upload', { method: 'POST', body: formData })
    const json = await res.json()

    if (!res.ok) {
      setUploadError(json.error || 'Upload failed')
      setUploadStep('error')
      return
    }

    setUploadResult(json.data)
    setUploadStep('processing')
  }

  const resetUpload = () => {
    setFile(null)
    setDetectedColumns([])
    setMapping({ rawText: '', submittedAt: '', submitterEmail: '' })
    setUploadStep('idle')
    setUploadResult(null)
    setUploadError('')
    setQueueStatus(null)
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
          <p className="text-sm text-gray-500 mt-0.5">Up to 500 rows per file, 10MB max</p>
        </div>

        {uploadStep === 'idle' && (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
              isDragActive
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/30'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragActive ? 'text-brand-400' : 'text-gray-600'}`} />
            <p className="text-gray-300 font-medium">
              {isDragActive ? 'Drop your CSV here' : 'Drag & drop your CSV file'}
            </p>
            <p className="text-gray-500 text-sm mt-1">or click to browse</p>
            <p className="text-gray-600 text-xs mt-3">Accepted: .csv | Required column: text/feedback/content</p>
          </div>
        )}

        {uploadStep === 'mapping' && file && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/60 border border-gray-700">
              <FileText className="w-5 h-5 text-brand-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB · {detectedColumns.length} columns detected</p>
              </div>
              <button onClick={resetUpload} className="text-gray-500 hover:text-gray-300">
                <X className="w-4 h-4" />
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
                  <label className="w-36 text-xs text-gray-400 flex-shrink-0">{label}</label>
                  <select
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

        {uploadStep === 'uploading' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
            <p className="text-gray-300 text-sm">Uploading and parsing CSV…</p>
          </div>
        )}

        {uploadStep === 'processing' && uploadResult && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <p className="text-green-400 font-medium text-sm">{uploadResult.itemsQueued} items queued for classification</p>
              </div>
              {uploadResult.errors.length > 0 && (
                <p className="text-amber-400 text-xs">{uploadResult.errors.length} rows skipped</p>
              )}
            </div>

            {queueStatus && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Classification progress (updates every 3s)</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Pending', value: queueStatus.pending, color: 'text-gray-400' },
                    { label: 'Classifying', value: queueStatus.classifying, color: 'text-purple-400' },
                    { label: 'Total', value: queueStatus.total, color: 'text-white' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="p-3 rounded-lg bg-gray-800 text-center">
                      <p className={`text-xl font-bold ${color}`}>{value}</p>
                      <p className="text-xs text-gray-500">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  AI is classifying your feedback…
                </div>
              </div>
            )}
          </div>
        )}

        {uploadStep === 'done' && (
          <div className="text-center space-y-3 py-4">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
            <p className="text-white font-semibold">All done!</p>
            <p className="text-gray-400 text-sm">Your feedback has been classified and is ready to view.</p>
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

        {uploadStep === 'error' && (
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
