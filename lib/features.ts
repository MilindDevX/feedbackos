// ABOUTME: Switches for features that are built but not yet ready for public use.

// Zendesk and Intercom still depend on a background worker that is not deployed, so they stay
// "coming soon" (UI and endpoints) until INTEGRATIONS_ENABLED=1.
export function integrationsEnabled(env: { INTEGRATIONS_ENABLED?: string } = { INTEGRATIONS_ENABLED: process.env.INTEGRATIONS_ENABLED }): boolean {
  return env.INTEGRATIONS_ENABLED === '1'
}

// The public read-only demo is on unless explicitly turned off.
export function demoEnabled(env: { DEMO_ENABLED?: string } = { DEMO_ENABLED: process.env.DEMO_ENABLED }): boolean {
  return env.DEMO_ENABLED !== '0'
}
