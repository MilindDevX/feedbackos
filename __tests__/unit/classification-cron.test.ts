jest.mock('@/lib/dashboard-cache', () => ({ invalidateDashboard: jest.fn(), dashboardCacheKey: jest.fn() }))
import { NextRequest } from 'next/server'

jest.mock('@/lib/classification/dispatch', () => ({
  findRecoverableClassifications: jest.fn(),
}))
jest.mock('@/lib/classification/publish', () => ({
  publishClassification: jest.fn(),
}))
jest.mock('@/lib/imports/csv', () => ({ repairCsvImports: jest.fn() }))
jest.mock('@/lib/imports/blob', () => ({ privateCsvBlob: {} }))

import { findRecoverableClassifications } from '@/lib/classification/dispatch'
import { publishClassification } from '@/lib/classification/publish'
import { repairCsvImports } from '@/lib/imports/csv'
import { GET } from '@/app/api/cron/classification/route'

const findWork = findRecoverableClassifications as jest.Mock
const publish = publishClassification as jest.Mock
const previousSecret = process.env.CRON_SECRET

afterEach(() => {
  jest.clearAllMocks()
  if (previousSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = previousSecret
})

function request(authorization?: string): NextRequest {
  return new NextRequest('http://localhost/api/cron/classification', {
    headers: authorization ? { authorization } : {},
  })
}

it('rejects cron requests without a configured secret', async () => {
  delete process.env.CRON_SECRET
  const response = await GET(request())
  expect(response.status).toBe(503)
  expect(findWork).not.toHaveBeenCalled()
})

it('rejects unauthorized requests before querying work', async () => {
  process.env.CRON_SECRET = 'test-only-cron-secret'
  const response = await GET(request('Bearer wrong'))
  expect(response.status).toBe(401)
  expect(findWork).not.toHaveBeenCalled()
})

it('publishes bounded ID-only recovery messages', async () => {
  process.env.CRON_SECRET = 'test-only-cron-secret'
  findWork.mockResolvedValue([{ feedbackItemId: 'item-1', organizationId: 'org-1' }])
  publish.mockResolvedValue('job-1')

  const response = await GET(request('Bearer test-only-cron-secret'))

  expect(response.status).toBe(200)
  expect(findWork).toHaveBeenCalledWith(expect.any(Date), 100)
  expect(publish).toHaveBeenCalledWith({ feedbackItemId: 'item-1', organizationId: 'org-1' }, 0, expect.any(Number))
  expect(await response.json()).toEqual({ published: 1, failed: 0 })
})

it('reports publish failure without marking durable work complete', async () => {
  process.env.CRON_SECRET = 'test-only-cron-secret'
  findWork.mockResolvedValue([{ feedbackItemId: 'item-1', organizationId: 'org-1' }])
  publish.mockRejectedValue(new Error('Queue unavailable'))

  const response = await GET(request('Bearer test-only-cron-secret'))

  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ published: 0, failed: 1 })
})

it('repairs CSV imports only after authorization and still recovers work if repair fails', async () => {
  process.env.CRON_SECRET = 'test-only-cron-secret'
  await GET(request('Bearer wrong'))
  expect(repairCsvImports).not.toHaveBeenCalled()

  jest.mocked(repairCsvImports).mockRejectedValueOnce(new Error('blob store unavailable'))
  findWork.mockResolvedValue([{ feedbackItemId: 'item-1', organizationId: 'org-1' }])
  publish.mockResolvedValue('job-1')

  const response = await GET(request('Bearer test-only-cron-secret'))

  expect(repairCsvImports).toHaveBeenCalledTimes(1)
  expect(publish).toHaveBeenCalledTimes(1)
  expect(response.status).toBe(200)
})
