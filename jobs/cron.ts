import { db } from '../lib/db'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const fromEmail = process.env.EMAIL_FROM || 'noreply@feedbackos.app'

export async function runAlertEvaluations() {
  console.log('[Cron] Starting alert evaluations...')
  const now = new Date()

  // Get all active rules
  const rules = await db.alertRule.findMany({
    where: { isActive: true },
    include: { organization: true },
  })

  for (const rule of rules) {
    try {
      // Avoid firing too frequently (e.g. wait at least windowHours before firing again)
      if (rule.lastFiredAt) {
        const hoursSinceLastFire = (now.getTime() - rule.lastFiredAt.getTime()) / 3600000
        if (hoursSinceLastFire < rule.windowHours) {
          continue
        }
      }

      const windowStart = new Date(now.getTime() - rule.windowHours * 3600000)

      // Count matching feedback
      const count = await db.feedbackItem.count({
        where: {
          organizationId: rule.organizationId,
          submittedAt: { gte: windowStart },
          status: { in: ['CLASSIFIED', 'REVIEWED'] },
          classification: {
            ...(rule.theme && { theme: rule.theme }),
            ...(rule.sentimentFilter && { sentiment: rule.sentimentFilter }),
          },
        },
      })

      if (count >= rule.threshold) {
        console.log(`[Cron] Rule triggered: ${rule.name} (${count} items >= ${rule.threshold})`)

        // Send email alerts
        if (rule.emailRecipients.length > 0 && process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.includes('placeholder')) {
          await resend.emails.send({
            from: fromEmail,
            to: rule.emailRecipients,
            subject: `[FeedbackOS Alert] ${rule.name} threshold exceeded`,
            html: `
              <h2>Alert: ${rule.name}</h2>
              <p>Your FeedbackOS alert rule has triggered.</p>
              <ul>
                <li><strong>Organization:</strong> ${rule.organization.name}</li>
                <li><strong>Condition:</strong> ${rule.theme || 'Any Theme'} / ${rule.sentimentFilter || 'Any Sentiment'}</li>
                <li><strong>Threshold:</strong> ${rule.threshold} items in ${rule.windowHours} hours</li>
                <li><strong>Actual count:</strong> ${count} items</li>
              </ul>
              <p><a href="${process.env.NEXTAUTH_URL}/feedback?dateFrom=${windowStart.toISOString()}">View matching feedback</a></p>
            `,
          })
        }

        // Update last fired
        await db.alertRule.update({
          where: { id: rule.id },
          data: { lastFiredAt: now },
        })
      }
    } catch (err) {
      console.error(`[Cron] Error evaluating rule ${rule.id}:`, err)
    }
  }

  console.log('[Cron] Evaluations complete.')
}

// If run directly
if (require.main === module) {
  runAlertEvaluations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
