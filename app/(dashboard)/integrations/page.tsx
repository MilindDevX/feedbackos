'use client'

import { useEffect, useState } from 'react'
import { Zap, Link2, CheckCircle2, AlertCircle, Loader2, Copy, RefreshCw, ExternalLink, Clock } from 'lucide-react'
import { timeAgo } from '@/lib/utils'

interface Integration {
  id: string
  type: string
  displayName: string
  isActive: boolean
  lastSyncedAt: string | null
  lastSyncStatus: string | null
}

type Tab = 'zendesk' | 'intercom'

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('zendesk')

  // Zendesk form state
  const [zSubdomain, setZSubdomain] = useState('')
  const [zEmail, setZEmail] = useState('')
  const [zToken, setZToken] = useState('')
  const [zSaving, setZSaving] = useState(false)
  const [zTesting, setZTesting] = useState(false)
  const [zTestResult, setZTestResult] = useState<'success' | 'error' | null>(null)
  const [zError, setZError] = useState('')
  const [zSuccess, setZSuccess] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState('')

  const [copied, setCopied] = useState(false)

  const zendeskIntegration = integrations.find(i => i.type === 'ZENDESK')

  useEffect(() => {
    const fetchIntegrations = async () => {
      const res = await fetch('/api/integrations')
      const json = await res.json()
      setIntegrations(json.data || [])
      setLoading(false)
    }
    fetchIntegrations()
  }, [])

  const handleSaveZendesk = async (e: React.FormEvent) => {
    e.preventDefault()
    setZSaving(true)
    setZError('')
    setZSuccess(false)

    const res = await fetch('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'ZENDESK',
        displayName: `Zendesk (${zSubdomain})`,
        config: { subdomain: zSubdomain, email: zEmail, apiToken: zToken },
      }),
    })

    if (!res.ok) {
      const json = await res.json()
      setZError(json.error || 'Failed to save')
    } else {
      setZSuccess(true)
      const json = await res.json()
      setIntegrations(prev => [...prev.filter(i => i.type !== 'ZENDESK'), json.data])
    }
    setZSaving(false)
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult('')
    const res = await fetch('/api/integrations/zendesk/sync', { method: 'POST' })
    if (res.ok) {
      setSyncResult('Sync started — tickets will appear in Feedback shortly.')
    } else {
      setSyncResult('Sync failed. Check your Zendesk credentials.')
    }
    setSyncing(false)

    // Refresh integrations to update lastSyncedAt
    setTimeout(async () => {
      const r = await fetch('/api/integrations')
      const j = await r.json()
      setIntegrations(j.data || [])
    }, 2000)
  }

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/intercom`
    : '/api/webhooks/intercom'

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Integrations</h1>
        <p className="text-sm text-gray-500 mt-0.5">Connect your support tools to auto-ingest feedback</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-900 rounded-xl border border-gray-800 w-fit">
        {(['zendesk', 'intercom'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === tab
                ? 'bg-gray-800 text-white shadow'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Zendesk Tab */}
      {activeTab === 'zendesk' && (
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-white">Zendesk</h2>
              <p className="text-sm text-gray-500 mt-0.5">Pull tickets from your Zendesk account</p>
              {zendeskIntegration && (
                <div className="flex items-center gap-2 mt-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-xs text-green-400">Connected</span>
                  {zendeskIntegration.lastSyncedAt && (
                    <span className="text-xs text-gray-500">· Last synced {timeAgo(zendeskIntegration.lastSyncedAt)}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {zendeskIntegration && (
            <div className="space-y-3 p-4 rounded-lg bg-gray-800/50 border border-gray-700">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">{zendeskIntegration.displayName}</p>
                <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Active</span>
              </div>
              {zendeskIntegration.lastSyncStatus && (
                <p className="text-xs text-gray-500">Last sync: {zendeskIntegration.lastSyncStatus}</p>
              )}
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm transition-colors disabled:opacity-50"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sync Now
              </button>
              {syncResult && (
                <p className={`text-xs ${syncResult.includes('failed') ? 'text-red-400' : 'text-green-400'}`}>
                  {syncResult}
                </p>
              )}
            </div>
          )}

          <form onSubmit={handleSaveZendesk} className="space-y-4">
            <p className="text-sm font-medium text-gray-300">
              {zendeskIntegration ? 'Update credentials' : 'Connect Zendesk'}
            </p>

            {[
              { id: 'subdomain', label: 'Subdomain', placeholder: 'yourcompany', value: zSubdomain, onChange: setZSubdomain, suffix: '.zendesk.com' },
              { id: 'email', label: 'Admin email', placeholder: 'admin@yourcompany.com', value: zEmail, onChange: setZEmail },
              { id: 'token', label: 'API token', placeholder: 'Paste your API token', value: zToken, onChange: setZToken, type: 'password' },
            ].map(({ id, label, placeholder, value, onChange, suffix, type }) => (
              <div key={id} className="space-y-1.5">
                <label htmlFor={id} className="block text-xs font-medium text-gray-400">{label}</label>
                <div className="flex items-center">
                  <input
                    id={id}
                    type={type || 'text'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    required
                    className="flex-1 px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                  />
                  {suffix && (
                    <span className="ml-2 text-xs text-gray-600">{suffix}</span>
                  )}
                </div>
              </div>
            ))}

            {zError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {zError}
              </div>
            )}
            {zSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Zendesk connected! Use the Sync Now button to import tickets.
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={zSaving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white text-sm font-medium transition-all disabled:opacity-50"
              >
                {zSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {zSaving ? 'Saving…' : 'Save Connection'}
              </button>
            </div>

            <div className="text-xs text-gray-600 flex items-start gap-1.5">
              <span>🔒</span>
              <span>Your API token is encrypted with AES-256 before storage and never exposed in API responses.</span>
            </div>
          </form>
        </div>
      )}

      {/* Intercom Tab */}
      {activeTab === 'intercom' && (
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Link2 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Intercom Webhook</h2>
              <p className="text-sm text-gray-500 mt-0.5">Receive conversations in real-time via webhook</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-300 mb-2">Your webhook URL</p>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-900 border border-gray-800">
                <code className="flex-1 text-xs text-brand-300 font-mono break-all">{webhookUrl}</code>
                <button
                  onClick={copyWebhookUrl}
                  className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs transition-colors"
                >
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-800 space-y-3">
              <p className="text-sm font-medium text-white">Setup Instructions</p>
              <ol className="space-y-2 text-sm text-gray-400 list-decimal list-inside">
                <li>In Intercom, go to <strong className="text-gray-300">Settings → Integrations → Webhooks</strong></li>
                <li>Click <strong className="text-gray-300">New webhook</strong></li>
                <li>Paste the URL above as your webhook endpoint</li>
                <li>Select topics: <code className="text-xs bg-gray-800 px-1.5 py-0.5 rounded">conversation.created</code> and <code className="text-xs bg-gray-800 px-1.5 py-0.5 rounded">conversation.replied</code></li>
                <li>Copy the webhook secret from Intercom and set <code className="text-xs bg-gray-800 px-1.5 py-0.5 rounded">INTERCOM_WEBHOOK_SECRET</code> in your environment</li>
                <li>Save — new conversations will automatically appear in FeedbackOS within seconds</li>
              </ol>
            </div>

            <a
              href="https://developers.intercom.com/docs/references/webhooks/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Intercom Webhook Documentation
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
