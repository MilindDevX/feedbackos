// ABOUTME: Gate for localhost-only test helpers (test sign-in, in-process queue) used by automated local testing.
// ABOUTME: Requires an explicit opt-in, `next dev`, and no Vercel environment, so deployments can never enable it.

type Env = { LOCAL_TEST_MODE?: string; NODE_ENV?: string; VERCEL?: string; VERCEL_ENV?: string }

export function localTestMode(env: Env = {
  LOCAL_TEST_MODE: process.env.LOCAL_TEST_MODE,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
}): boolean {
  return env.LOCAL_TEST_MODE === '1' && env.NODE_ENV === 'development' && !env.VERCEL && !env.VERCEL_ENV
}

export function isLocalHost(host: string | null): boolean {
  if (!host) return false
  const name = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]'
}
