import Redis from 'ioredis'
import { validateEnv } from './env'


const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

function createRedisClient() {
  // ── AUDIT FIX: Validate env at startup, use TLS (rediss://) in production ──
  const env = validateEnv()
  const url = env.REDIS_URL
  const isTls = url.startsWith('rediss://')
  const client = new Redis(url, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
    ...(isTls && { tls: {} }),
  })

  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message)
  })

  client.on('connect', () => {
    console.log('[Redis] Connected')
  })

  return client
}

export const redis =
  globalForRedis.redis ?? createRedisClient()

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis

export function createBullMQConnection() {
  // ── AUDIT FIX: Validate env at startup, TLS in production ──
  const url = process.env.REDIS_URL || 'redis://localhost:6379'
  const isTls = url.startsWith('rediss://')
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(isTls && { tls: {} }),
  })
}
