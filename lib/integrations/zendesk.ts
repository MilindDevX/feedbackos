import { decrypt } from '../encryption'

export interface ZendeskConfig {
  subdomain: string
  email: string
  apiToken: string
}

export interface ZendeskTicket {
  id: number
  subject: string
  description: string
  status: string
  created_at: string
  updated_at: string
  requester_id: number
  via?: {
    channel?: string
  }
}

export interface ZendeskTicketsResponse {
  tickets: ZendeskTicket[]
  next_page?: string | null
  count: number
}

export function decryptZendeskConfig(configEncrypted: string): ZendeskConfig {
  const raw = decrypt(configEncrypted)
  return JSON.parse(raw) as ZendeskConfig
}

export function buildZendeskAuth(config: ZendeskConfig): string {
  const credentials = `${config.email}/token:${config.apiToken}`
  return `Basic ${Buffer.from(credentials).toString('base64')}`
}

export async function fetchZendeskTickets(
  config: ZendeskConfig,
  options: {
    startTime?: string // ISO8601 or unix timestamp
    perPage?: number
    cursor?: string
  } = {}
): Promise<{ tickets: ZendeskTicket[]; nextCursor?: string }> {
  const { subdomain, email, apiToken } = config
  const auth = buildZendeskAuth(config)
  const perPage = options.perPage ?? 100

  let url: string
  if (options.cursor) {
    url = `https://${subdomain}.zendesk.com${options.cursor}`
  } else {
    const params = new URLSearchParams({
      'page[size]': String(perPage),
      sort: 'created_at',
    })
    if (options.startTime) {
      // Use time-based export for incremental sync
      url = `https://${subdomain}.zendesk.com/api/v2/tickets/cursor.json?${params}`
    } else {
      url = `https://${subdomain}.zendesk.com/api/v2/tickets.json?${params}`
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Zendesk API error ${response.status}: ${errorText}`)
  }

  const data = await response.json() as {
    tickets?: ZendeskTicket[]
    results?: ZendeskTicket[]
    meta?: { has_more?: boolean; after_cursor?: string }
    next_page?: string
  }

  const tickets = data.tickets || data.results || []
  const nextCursor = data.meta?.has_more && data.meta?.after_cursor
    ? data.meta.after_cursor
    : undefined

  return { tickets, nextCursor }
}

export async function testZendeskConnection(config: ZendeskConfig): Promise<boolean> {
  const { subdomain } = config
  const auth = buildZendeskAuth(config)

  const response = await fetch(
    `https://${subdomain}.zendesk.com/api/v2/account/settings.json`,
    { headers: { Authorization: auth } }
  )
  return response.ok
}

export function mapZendeskTicketToFeedback(ticket: ZendeskTicket): {
  rawText: string
  externalId: string
  submittedAt: Date
  metadata: Record<string, unknown>
} {
  const rawText = [ticket.subject, ticket.description]
    .filter(Boolean)
    .join('\n\n')

  return {
    rawText: rawText || `Ticket #${ticket.id}`,
    externalId: `zendesk-${ticket.id}`,
    submittedAt: new Date(ticket.created_at),
    metadata: {
      ticketId: ticket.id,
      status: ticket.status,
      channel: ticket.via?.channel,
      updatedAt: ticket.updated_at,
    },
  }
}
