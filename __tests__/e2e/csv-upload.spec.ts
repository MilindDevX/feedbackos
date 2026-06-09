/**
 * E2E TEST SPEC: CSV Upload → Processing → Feedback Table (Playwright)
 *
 * Prerequisites:
 *   1. npm install -D @playwright/test
 *   2. npx playwright install chromium
 *   3. App + worker must be running: npm run dev
 *   4. DB seeded: npm run db:seed
 *
 * Run: npx playwright test e2e/csv-upload.spec.ts
 */

import { test, expect, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const DEMO_EMAIL = 'demo@feedbackos.app'

// Helper: log in as demo user via magic link bypass (seed sets emailVerified)
async function loginAsDemo(page: Page) {
  await page.goto(`${BASE_URL}/login`)

  // Use magic link / email form
  await page.getByPlaceholder(/email/i).fill(DEMO_EMAIL)
  await page.getByRole('button', { name: /sign in|send magic link|continue/i }).click()

  // In test env, direct-navigate with a seeded session cookie or
  // use the NextAuth test endpoint if configured. For simplicity,
  // we assume the seed creates a session token for test use.
  //
  // Alternatively, if the app supports bypass (dev-only) via ?bypass=true:
  // await page.goto(`${BASE_URL}/api/auth/debug-signin?email=${DEMO_EMAIL}`)
}

// Helper: create a temporary CSV file
function createTempCsv(rows: string[][]): string {
  const header = 'feedback_text,submitted_date,email'
  const csvContent = [header, ...rows.map((r) => r.join(','))].join('\n')
  const tmpFile = path.join(os.tmpdir(), `test-upload-${Date.now()}.csv`)
  fs.writeFileSync(tmpFile, csvContent, 'utf-8')
  return tmpFile
}

test.describe('CSV Upload → Classification → Feedback Table', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page)
    // Wait for redirect to dashboard
    await page.waitForURL(`${BASE_URL}/**`, { waitUntil: 'networkidle' })
  })

  test('user can upload a CSV and classified items appear in feedback table', async ({ page }) => {
    // 1. Create a CSV file with realistic feedback
    const csvPath = createTempCsv([
      ['"The API response times have gotten really slow recently"', '2024-01-15', 'tester@example.com'],
      ['"Love the new dashboard design - very intuitive"', '2024-01-16', 'user2@example.com'],
      ['"Please add dark mode support to the mobile app"', '2024-01-17', 'user3@example.com'],
    ])

    // 2. Navigate to the Ingest page
    await page.getByRole('link', { name: /ingest/i }).click()
    await expect(page).toHaveURL(/ingest/)

    // 3. Find CSV upload tab/section and upload the file
    await page.getByRole('tab', { name: /csv|upload/i }).click()

    // 4. Upload the file using the dropzone input
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(csvPath)

    // 5. Wait for column detection response
    await expect(page.getByText(/feedback_text|email|submitted_date/i)).toBeVisible({ timeout: 10000 })

    // 6. Map the "feedback_text" column to the rawText field
    const rawTextSelect = page.locator('select[name="rawText"], [data-field="rawText"] select').first()
    if (await rawTextSelect.isVisible()) {
      await rawTextSelect.selectOption('feedback_text')
    }

    // 7. Submit the upload
    await page.getByRole('button', { name: /import|upload|process/i }).click()

    // 8. Expect success notification
    await expect(
      page.getByText(/3 items|queued|successfully/i)
    ).toBeVisible({ timeout: 15000 })

    // 9. Navigate to Feedback table
    await page.getByRole('link', { name: /feedback/i }).first().click()
    await expect(page).toHaveURL(/feedback/)

    // 10. Wait for classification to complete (worker processes in background)
    // Poll for classified items (retry up to 30s)
    await expect(async () => {
      await page.reload()
      const rows = page.locator('[data-testid="feedback-row"], tr[data-feedback-id]')
      await expect(rows.first()).toBeVisible()
    }).toPass({ timeout: 30000, intervals: [3000] })

    // 11. Verify the performance feedback item appears with correct classification
    const performanceItem = page.getByText(/API response times/i)
    await expect(performanceItem).toBeVisible({ timeout: 30000 })

    // 12. Click on the item to open slide-over and verify classification details
    await performanceItem.click()
    const slideOver = page.locator('[data-testid="feedback-slideover"], [role="dialog"]')
    await expect(slideOver).toBeVisible()
    await expect(slideOver.getByText(/performance|bug/i)).toBeVisible()

    // Cleanup
    fs.unlinkSync(csvPath)
  })

  test('shows graceful error when CSV has no valid rawText column after mapping', async ({ page }) => {
    // Create a CSV where the mapped column is all empty
    const csvPath = createTempCsv([
      ['', '2024-01-15', 'tester@example.com'],
      ['', '2024-01-16', 'user2@example.com'],
    ])

    await page.getByRole('link', { name: /ingest/i }).click()
    await page.getByRole('tab', { name: /csv|upload/i }).click()

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(csvPath)

    await page.getByRole('button', { name: /import|upload|process/i }).click()

    // Should show error about no valid rows
    await expect(
      page.getByText(/no valid rows|column.*has no valid data|check your csv/i)
    ).toBeVisible({ timeout: 10000 })

    fs.unlinkSync(csvPath)
  })
})
