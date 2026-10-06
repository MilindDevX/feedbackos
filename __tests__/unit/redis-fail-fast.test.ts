/**
 * UNIT TEST: the shared cache/rate-limit Redis client fails fast when Redis is unreachable.
 * Production once pointed REDIS_URL at localhost; with unbounded retries every request hung forever.
 */

describe('shared Redis client', () => {
  const originalUrl = process.env.REDIS_URL

  afterAll(() => {
    process.env.REDIS_URL = originalUrl
  })

  it('rejects a command within five seconds when nothing listens on the Redis port', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:1'
    jest.resetModules()
    const { redis } = await import('@/lib/redis')

    const started = Date.now()
    await expect(redis.get('any-key')).rejects.toBeDefined()
    expect(Date.now() - started).toBeLessThan(5000)

    redis.disconnect()
  }, 15000)
})
