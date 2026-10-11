import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTheme(theme: string): string {
  const map: Record<string, string> = {
    BUG_PROBLEM: 'Bug / Problem', FEATURE_REQUEST: 'Feature Request',
    USABILITY_ISSUE: 'Usability Issue', QUESTION_SUPPORT: 'Question / Support',
    PRAISE: 'Praise', OTHER: 'Other',
  }
  return map[theme] || theme
}

export function formatSentiment(sentiment: string): string {
  return sentiment.charAt(0) + sentiment.slice(1).toLowerCase()
}

export function formatStatus(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'Pending', CLASSIFYING: 'Classifying', CLASSIFIED: 'Classified',
    NEEDS_REVIEW: 'Needs Review', REVIEWED: 'Reviewed', CLASSIFICATION_ERROR: 'Error',
  }
  return map[status] || status
}

export function formatSource(source: string): string {
  const map: Record<string, string> = {
    ZENDESK: 'Zendesk', INTERCOM: 'Intercom', CSV: 'CSV', MANUAL: 'Manual', API: 'API',
  }
  return map[source] || source
}

export function timeAgo(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const THEME_COLORS: Record<string, string> = {
  BUG_PROBLEM: '#d4553d', FEATURE_REQUEST: '#4f7fd8', USABILITY_ISSUE: '#c98a1e',
  QUESTION_SUPPORT: '#9361c9', PRAISE: '#3a9a63', OTHER: '#8a8a9a',
}
