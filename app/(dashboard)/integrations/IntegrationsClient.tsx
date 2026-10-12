'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Copy, RefreshCw, ExternalLink, Lock } from 'lucide-react'
import { Notice, PageHeader, Panel, buttonClass, inputClass } from '@/components/ui/primitives'
import { cn, timeAgo } from '@/lib/utils'

interface Integration {
  id: string
  type: string
  displayName: string
  isActive: boolean
  lastSyncedAt: string | null
  lastSyncStatus: string | null
}

type Tab = 'zendesk' | 'intercom'

export default function IntegrationsClient() {
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

  const code = 'rounded bg-sunken px-1.5 py-0.5 text-xs text-ink'

  return (
    <div className="max-w-2xl">
      <PageHeader title="Integrations" description="Connect support tools so new conversations arrive and get classified automatically." />

      <div className="flex gap-1 border-b border-line mb-6" role="tablist" aria-label="Integration">
        {(['zendesk', 'intercom'] as Tab[]).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              '-mb-px px-3 py-2 text-sm capitalize border-b-2 transition-colors',
              activeTab === tab ? 'border-accent text-ink font-medium' : 'border-transparent text-ink-3 hover:text-ink'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'zendesk' && (
        <Panel className="p-5 sm:p-6 space-y-6" role="tabpanel">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-semibold text-ink">Zendesk</h2>
              {zendeskIntegration && <span className="tag tag-classified px-2 py-0.5 text-xs">Connected</span>}
            </div>
            <p className="mt-1 text-sm text-ink-3">
              Pull tickets from your Zendesk account.
              {zendeskIntegration?.lastSyncedAt && <> Last synced {timeAgo(zendeskIntegration.lastSyncedAt)}.</>}
            </p>
          </div>

          {zendeskIntegration && (
            <div className="rounded-lg bg-sunken p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">{zendeskIntegration.displayName}</p>
                {zendeskIntegration.lastSyncStatus && <p className="text-xs text-ink-3">Last sync: {zendeskIntegration.lastSyncStatus}</p>}
              </div>
              <button onClick={handleSync} disabled={syncing} className={buttonClass('secondary')}>
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-4 h-4" aria-hidden="true" />}
                Sync now
              </button>
            </div>
          )}
          {syncResult && <Notice tone={syncResult.includes('failed') ? 'error' : 'success'}>{syncResult}</Notice>}

          <form onSubmit={handleSaveZendesk} className="space-y-4">
            <p className="text-sm font-medium text-ink">{zendeskIntegration ? 'Update credentials' : 'Connect Zendesk'}</p>
            {[
              { id: 'subdomain', label: 'Subdomain', placeholder: 'yourcompany', value: zSubdomain, onChange: setZSubdomain, suffix: '.zendesk.com' },
              { id: 'email', label: 'Admin email', placeholder: 'admin@yourcompany.com', value: zEmail, onChange: setZEmail, type: 'email' },
              { id: 'token', label: 'API token', placeholder: 'Paste your API token', value: zToken, onChange: setZToken, type: 'password' },
            ].map(({ id, label, placeholder, value, onChange, suffix, type }) => (
              <div key={id} className="space-y-1.5">
                <label htmlFor={id} className="block text-sm text-ink-2">{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    id={id}
                    type={type || 'text'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    autoComplete="off"
                    required
                    className={inputClass}
                  />
                  {suffix && <span className="text-sm text-ink-3 flex-shrink-0">{suffix}</span>}
                </div>
              </div>
            ))}

            {zError && <Notice tone="error">{zError}</Notice>}
            {zSuccess && <Notice tone="success"><CheckCircle2 className="w-4 h-4 mt-0.5" aria-hidden="true" />Zendesk connected. Use Sync now to import tickets.</Notice>}

            <button type="submit" disabled={zSaving} className={buttonClass('primary', 'md', 'w-full sm:w-auto')}>
              {zSaving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {zSaving ? 'Saving…' : 'Save connection'}
            </button>
            <p className="flex items-start gap-1.5 text-xs text-ink-3">
              <Lock className="w-3.5 h-3.5 mt-px flex-shrink-0" aria-hidden="true" />
              Your API token is encrypted (AES-256) before storage and never returned by the API.
            </p>
          </form>
        </Panel>
      )}

      {activeTab === 'intercom' && (
        <Panel className="p-5 sm:p-6 space-y-6" role="tabpanel">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">Intercom webhook</h2>
            <p className="mt-1 text-sm text-ink-3">Receive new conversations in real time.</p>
          </div>

          <div>
            <p className="text-sm text-ink-2 mb-1.5">Webhook URL</p>
            <div className="flex items-center gap-2 rounded-md border border-line bg-sunken p-2 pl-3">
              <code className="flex-1 min-w-0 text-xs text-ink break-all">{webhookUrl}</code>
              <button onClick={copyWebhookUrl} className={buttonClass('secondary', 'sm')}>
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-success" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-ink mb-2">Setup</p>
            <ol className="space-y-2 text-sm text-ink-2 list-decimal pl-5 marker:text-ink-3">
              <li>In Intercom, open <strong className="text-ink font-medium">Settings → Integrations → Webhooks</strong>.</li>
              <li>Click <strong className="text-ink font-medium">New webhook</strong> and paste the URL above.</li>
              <li>Select <code className={code}>conversation.created</code> and <code className={code}>conversation.replied</code>.</li>
              <li>Copy the webhook secret and set <code className={code}>INTERCOM_WEBHOOK_SECRET</code> in your environment.</li>
              <li>Save. New conversations appear in FeedbackOS within seconds.</li>
            </ol>
          </div>

          <a href="https://developers.intercom.com/docs/references/webhooks/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover">
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            Intercom webhook documentation
          </a>
        </Panel>
      )}
    </div>
  )
}
