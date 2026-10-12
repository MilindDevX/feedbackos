// ABOUTME: Who may change workspace data. Viewers (including everyone in the public demo) can only read.

export const READ_ONLY_MESSAGE = 'You have view-only access to this workspace.'

export function canWrite(user: { role?: string | null } | null | undefined): boolean {
  return Boolean(user?.role) && user?.role !== 'VIEWER'
}
