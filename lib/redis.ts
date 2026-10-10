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
  // This client only serves caches, rate limits and health checks, which all tolerate a Redis outage.
  // BullMQ builds its own connection (createBullMQConnection), so unbounded retries are not needed here;
  // with them, an unreachable Redis made every request wait forever instead of skipping the cache.
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
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

// Returns plain connection options — avoids ioredis version conflicts with BullMQ's bundled ioredis
export function createBullMQConnection() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379'
  const isTls = url.startsWith('rediss://')
  // Parse URL into host/port/password for BullMQ's internal ioredis
  const parsed = new URL(url.replace(/^rediss?:\/\//, (m) => m === 'rediss://' ? 'https://' : 'http://'))
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    maxRetriesPerRequest: null as unknown as null,
    enableReadyCheck: false,
    ...(isTls && { tls: {} }),
  }
}
