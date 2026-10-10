import { prepareClassificationRequest } from '@/lib/ai/prompts'

it('bounds the complete multilingual request including output allowance', () => {
  const request = prepareClassificationRequest('搜索无法找到反馈。'.repeat(1000), ['Dashboard', 'Other'])
  expect(request).not.toBeNull()
  expect(request!.reservedTokens).toBeLessThanOrEqual(7000)
  expect(request!.reservedTokens).toBeGreaterThanOrEqual(
    Buffer.byteLength(request!.systemPrompt) + Buffer.byteLength(request!.userPrompt) + 512
  )
  expect(request!.truncated).toBe(true)
})

it('routes an oversized product-area list to review rather than an unbounded request', () => {
  expect(prepareClassificationRequest('The dashboard cannot find my saved feedback.', ['a'.repeat(8000)]))
    .toBeNull()
})

it('keeps complete short feedback in its prepared prompt', () => {
  const request = prepareClassificationRequest('The export button fails after selecting feedback.', ['API', 'Other'])
  expect(request!.userPrompt).toContain('The export button fails after selecting feedback.')
  expect(request!.truncated).toBe(false)
})
