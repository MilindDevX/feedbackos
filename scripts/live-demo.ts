import { chromium } from 'playwright'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const BASE_URL = 'http://localhost:3000'
const DEMO_EMAIL = 'demo@feedbackos.app'
const ARTIFACT_DIR = process.cwd()

async function runDemo() {
  const db = new PrismaClient()
  console.log('Setting up DB session...')
  const user = await db.user.findUnique({ where: { email: DEMO_EMAIL } })
  if (!user) throw new Error('Demo user not found. Did you run db:seed?')
  
  const token = randomUUID()
  await db.session.create({
    data: {
      sessionToken: token,
      userId: user.id,
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
    }
  })

  console.log('Launching browser in visible mode...')
  const browser = await chromium.launch({ headless: false, slowMo: 150 })
  const context = await browser.newContext()
  
  // Set the NextAuth session cookie
  await context.addCookies([
    {
      name: 'authjs.session-token',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }
  ])

  const page = await context.newPage()
  await page.setViewportSize({ width: 1280, height: 800 })

  console.log('Navigating to dashboard...')
  await page.goto(`${BASE_URL}/`)
  
  // 1. Dashboard Screenshot
  console.log('Capturing Dashboard...')
  await page.waitForTimeout(3000) // Wait for charts
  await page.screenshot({ path: `${ARTIFACT_DIR}/demo_1_dashboard.png` })

  // 2. Feedback Table Screenshot
  console.log('Capturing Feedback Table...')
  await page.getByRole('link', { name: /feedback/i }).first().click()
  await page.waitForURL('**/feedback', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${ARTIFACT_DIR}/demo_2_table.png` })

  // 3. Submitting Manual Feedback
  console.log('Submitting new feedback...')
  await page.getByRole('link', { name: /ingest/i }).first().click()
  await page.waitForURL('**/ingest', { waitUntil: 'networkidle' })
  
  const manualTab = page.getByRole('tab', { name: /manual/i })
  if (await manualTab.isVisible()) {
    await manualTab.click()
  }
  
  const feedbackText = "The CSV upload is completely broken for files over 2MB. It times out after 30 seconds and our support team can't import the historical data. Please fix this critical bug."
  await page.locator('textarea').first().fill(feedbackText)
  
  const emailInput = page.locator('input[type="email"]').first()
  if (await emailInput.isVisible()) {
      await emailInput.fill('urgent@example.com')
  }

  await page.getByRole('button', { name: /submit|ingest/i }).click()
  
  console.log('Waiting for AI worker to classify...')
  await page.waitForTimeout(3000)

  // 4. Checking Classification Result
  await page.getByRole('link', { name: /feedback/i }).first().click()
  await page.waitForURL('**/feedback', { waitUntil: 'networkidle' })
  
  let found = false
  for (let i = 0; i < 15; i++) {
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    
    const newRow = page.getByText(/CSV upload is completely broken/i)
    if (await newRow.count() > 0) {
      const rowText = await newRow.locator('..').locator('..').textContent()
      if (rowText && rowText.toLowerCase().includes('classified')) {
         console.log('Item classified!')
         found = true
         break
      }
    }
    console.log(`Waiting... (${i+1}/15)`)
    await page.waitForTimeout(2000)
  }

  if (found) {
    console.log('Capturing Classification Details...')
    const newRowText = page.getByText(/CSV upload is completely broken/i).first()
    await newRowText.click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${ARTIFACT_DIR}/demo_3_classification.png` })
  } else {
    console.log('Item was not classified in time. Taking fallback screenshot.')
    await page.screenshot({ path: `${ARTIFACT_DIR}/demo_3_classification.png` })
  }

  await browser.close()
  await db.$disconnect()
  console.log('Demo finished.')
}

runDemo().catch(err => {
    console.error(err)
    process.exit(1)
})
