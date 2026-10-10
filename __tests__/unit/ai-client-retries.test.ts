import { openai } from '@/lib/ai/client'

it('uses the database-backed retry owner rather than hidden SDK retries', () => {
  expect(openai.maxRetries).toBe(0)
})
