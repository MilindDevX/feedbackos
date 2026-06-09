import { PrismaClient, SourceType, FeedbackStatus, Theme, Sentiment } from '@prisma/client'

const prisma = new PrismaClient()

const themes: Theme[] = ['BUG', 'FEATURE_REQUEST', 'PRICING', 'ONBOARDING', 'PERFORMANCE', 'PRAISE', 'OTHER']
const sentiments: Sentiment[] = ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED']
const sources: SourceType[] = ['ZENDESK', 'CSV', 'MANUAL', 'INTERCOM']

const sampleFeedback = [
  // BUG feedback
  {
    rawText: "The export button completely breaks when I have more than 200 records selected. It just spins forever and I have to refresh the page. Lost my work twice today.",
    theme: 'BUG' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "Export button hangs with 200+ records selected", source: 'ZENDESK' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "CSV export is downloading a completely empty file. The header row is there but no data. This started happening after last week's update.",
    theme: 'BUG' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "CSV export downloads empty file after recent update", source: 'ZENDESK' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "Login with Google keeps saying 'OAuth error' on mobile Chrome. Works fine on desktop. Please fix this ASAP — half my team can't log in.",
    theme: 'BUG' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "Google OAuth fails on mobile Chrome for team users", source: 'INTERCOM' as SourceType, productArea: 'Authentication',
  },
  {
    rawText: "Webhooks stopped firing about 3 hours ago. Our Zapier integration is completely broken. We have a live demo in 2 hours, this is critical.",
    theme: 'BUG' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "Webhooks stopped firing, breaking downstream integrations", source: 'ZENDESK' as SourceType, productArea: 'API',
  },
  {
    rawText: "The search filter doesn't reset when I navigate away and come back. It shows wrong results. I have to manually clear the filters every time.",
    theme: 'BUG' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "Search filters persist incorrectly between navigation", source: 'MANUAL' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "Notifications are not being sent to Slack even though it's connected. Tested the webhook URL manually and it works. Something's wrong on your end.",
    theme: 'BUG' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "Slack notifications not firing despite valid webhook", source: 'ZENDESK' as SourceType, productArea: 'Integrations',
  },
  {
    rawText: "The date picker is completely broken in Safari. Clicking any date closes the calendar without selecting it. This is a dealbreaker for several of our Mac users.",
    theme: 'BUG' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "Date picker non-functional in Safari browser", source: 'INTERCOM' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "API rate limit endpoint returns 200 even when we exceed the limit. Our client thinks everything is fine but nothing is being saved. Very confusing.",
    theme: 'BUG' as Theme, sentiment: 'MIXED' as Sentiment, summary: "API returns 200 incorrectly when rate limit exceeded", source: 'ZENDESK' as SourceType, productArea: 'API',
  },
  {
    rawText: "Two-factor authentication code expires too quickly. By the time I get the SMS, the code is already expired. Takes 4-5 attempts to get in.",
    theme: 'BUG' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "2FA codes expire before SMS is received", source: 'MANUAL' as SourceType, productArea: 'Authentication',
  },
  {
    rawText: "Bulk delete operation says 'success' but only deletes about half the selected records. Had to run it 4 times to clear my test data.",
    theme: 'BUG' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "Bulk delete silently fails on partial record sets", source: 'CSV' as SourceType, productArea: 'Dashboard',
  },
  // FEATURE_REQUEST feedback
  {
    rawText: "Would love to see a Kanban view for managing feedback items. The table is great but being able to drag cards between stages would make our workflow so much faster.",
    theme: 'FEATURE_REQUEST' as Theme, sentiment: 'NEUTRAL' as Sentiment, summary: "Request for Kanban board view of feedback items", source: 'MANUAL' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "Please add the ability to add custom fields to feedback submissions. We need to capture customer tier (free/pro/enterprise) along with each item.",
    theme: 'FEATURE_REQUEST' as Theme, sentiment: 'NEUTRAL' as Sentiment, summary: "Need custom fields for customer tier on feedback items", source: 'ZENDESK' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "An API endpoint to programmatically update tags would be huge for us. We're building an internal tool that processes feedback and want to push tags back to your system.",
    theme: 'FEATURE_REQUEST' as Theme, sentiment: 'POSITIVE' as Sentiment, summary: "Request for API endpoint to programmatically update tags", source: 'MANUAL' as SourceType, productArea: 'API',
  },
  {
    rawText: "It would be incredible to have a digest email that summarizes the week's top feedback themes every Monday morning. Our leadership team would love this.",
    theme: 'FEATURE_REQUEST' as Theme, sentiment: 'POSITIVE' as Sentiment, summary: "Weekly email digest of top feedback themes requested", source: 'INTERCOM' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "Can you add Jira integration? We spend a lot of time manually copying bug reports from your tool into Jira tickets. A one-click sync would save hours each week.",
    theme: 'FEATURE_REQUEST' as Theme, sentiment: 'NEUTRAL' as Sentiment, summary: "Jira integration for one-click bug report sync requested", source: 'ZENDESK' as SourceType, productArea: 'Integrations',
  },
  {
    rawText: "Please support SSO with Okta. Our security team won't approve tools without SSO and we really want to switch all 50 users to your platform.",
    theme: 'FEATURE_REQUEST' as Theme, sentiment: 'NEUTRAL' as Sentiment, summary: "Okta SSO support required for company-wide adoption", source: 'MANUAL' as SourceType, productArea: 'Authentication',
  },
  {
    rawText: "I'd love granular role-based permissions. Right now everyone can delete records. We need view-only, editor, and admin levels.",
    theme: 'FEATURE_REQUEST' as Theme, sentiment: 'NEUTRAL' as Sentiment, summary: "Granular RBAC with view, editor, admin levels needed", source: 'CSV' as SourceType, productArea: 'Authentication',
  },
  {
    rawText: "Dashboard widgets should be customizable — let me choose which metrics appear on my homepage. Different team members care about different things.",
    theme: 'FEATURE_REQUEST' as Theme, sentiment: 'POSITIVE' as Sentiment, summary: "Customizable dashboard widget layout per user", source: 'INTERCOM' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "A mobile app (or at least a responsive mobile web view) would be amazing. I need to review feedback during commutes and the current site is unusable on phone.",
    theme: 'FEATURE_REQUEST' as Theme, sentiment: 'MIXED' as Sentiment, summary: "Mobile-responsive view or native app requested", source: 'MANUAL' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "Audit logs please! We need to see who changed what and when, especially for compliance. Right now there's no way to track changes to classifications.",
    theme: 'FEATURE_REQUEST' as Theme, sentiment: 'NEUTRAL' as Sentiment, summary: "Audit logs for classification changes needed for compliance", source: 'ZENDESK' as SourceType, productArea: 'Dashboard',
  },
  // PRICING feedback
  {
    rawText: "The Pro plan jumped from $49 to $89 overnight with no notice. That's an 81% increase. I understand pricing needs to change but this is a terrible way to treat loyal customers.",
    theme: 'PRICING' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "Sudden 81% price increase without customer notification", source: 'ZENDESK' as SourceType, productArea: 'Billing',
  },
  {
    rawText: "Why are API calls counted against our monthly quota? We're paying for the seat license — the API should be included. Every other tool in this space does it.",
    theme: 'PRICING' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "API calls billed separately from seat license is unfair", source: 'INTERCOM' as SourceType, productArea: 'API',
  },
  {
    rawText: "Would love an annual billing option. Monthly payments are annoying to track and a 15-20% discount for annual would make the decision to upgrade much easier.",
    theme: 'PRICING' as Theme, sentiment: 'NEUTRAL' as Sentiment, summary: "Annual billing with discount would drive plan upgrades", source: 'MANUAL' as SourceType, productArea: 'Billing',
  },
  {
    rawText: "The startup discount program you advertised on your blog — how do I apply? We're a seed-stage company and the standard pricing is out of reach right now.",
    theme: 'PRICING' as Theme, sentiment: 'NEUTRAL' as Sentiment, summary: "Startup discount program application process unclear", source: 'ZENDESK' as SourceType, productArea: 'Billing',
  },
  {
    rawText: "I was charged twice this month. I see two identical charges on my credit card statement. Please refund and fix whatever caused this.",
    theme: 'PRICING' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "Duplicate billing charge this month needs urgent refund", source: 'ZENDESK' as SourceType, productArea: 'Billing',
  },
  // ONBOARDING feedback
  {
    rawText: "Spent 45 minutes trying to get my first integration working. The documentation links in the setup wizard are broken and point to 404 pages. Very frustrating first experience.",
    theme: 'ONBOARDING' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "Broken documentation links in setup wizard during onboarding", source: 'ZENDESK' as SourceType, productArea: 'Onboarding',
  },
  {
    rawText: "The initial setup is overwhelming. You're asked to configure 8 things before you can submit a single piece of feedback. Can you create a simpler 'quick start' mode?",
    theme: 'ONBOARDING' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "Complex setup requires 8 steps before first feedback submission", source: 'INTERCOM' as SourceType, productArea: 'Onboarding',
  },
  {
    rawText: "Your getting started video is incredibly well made and helped me get up and running in 15 minutes. I wish I'd found it before trying the docs.",
    theme: 'ONBOARDING' as Theme, sentiment: 'POSITIVE' as Sentiment, summary: "Getting started video praised for quality and clarity", source: 'MANUAL' as SourceType, productArea: 'Onboarding',
  },
  {
    rawText: "Inviting team members should be step 1 of onboarding, not buried in settings. We almost gave up because we couldn't figure out how to add our PM.",
    theme: 'ONBOARDING' as Theme, sentiment: 'MIXED' as Sentiment, summary: "Team invitation buried in settings instead of onboarding flow", source: 'CSV' as SourceType, productArea: 'Onboarding',
  },
  {
    rawText: "The CSV import template you provide doesn't match what's actually accepted. Spent an hour reformatting our data before realizing the template was outdated.",
    theme: 'ONBOARDING' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "CSV import template doesn't match accepted format", source: 'ZENDESK' as SourceType, productArea: 'Onboarding',
  },
  {
    rawText: "Would love a sandbox/demo environment to test things out before connecting our real Zendesk account. I'm hesitant to grant production access just to evaluate the tool.",
    theme: 'ONBOARDING' as Theme, sentiment: 'NEUTRAL' as Sentiment, summary: "Sandbox environment needed to safely evaluate integrations", source: 'INTERCOM' as SourceType, productArea: 'Onboarding',
  },
  // PERFORMANCE feedback
  {
    rawText: "Dashboard takes 12-15 seconds to load when I have more than 1,000 feedback items. This is completely unusable for daily work. Need some serious optimization.",
    theme: 'PERFORMANCE' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "Dashboard loads 12-15 seconds with 1000+ feedback items", source: 'ZENDESK' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "The API response time has gotten significantly worse over the past 2 weeks. P99 is now over 3 seconds where it used to be under 500ms. Something changed.",
    theme: 'PERFORMANCE' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "API P99 latency degraded from 500ms to 3s recently", source: 'MANUAL' as SourceType, productArea: 'API',
  },
  {
    rawText: "Uploading a 5MB CSV file takes forever — the browser tab just hangs for 2-3 minutes. Other tools handle this instantly. Please optimize the upload pipeline.",
    theme: 'PERFORMANCE' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "5MB CSV upload hangs browser for 2-3 minutes", source: 'ZENDESK' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "Search results take 4+ seconds to appear when I type in the filter box. The UI becomes unresponsive. Feels like it's searching on every keystroke without debouncing.",
    theme: 'PERFORMANCE' as Theme, sentiment: 'NEGATIVE' as Sentiment, summary: "Real-time search causes 4-second delays on keystroke", source: 'INTERCOM' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "The chart animations lag horribly on my work laptop (i5, 16GB RAM). They should be smooth — maybe offer a reduced motion option for lower-powered machines.",
    theme: 'PERFORMANCE' as Theme, sentiment: 'MIXED' as Sentiment, summary: "Chart animations lag on mid-tier hardware, reduced motion needed", source: 'MANUAL' as SourceType, productArea: 'Dashboard',
  },
  // PRAISE feedback
  {
    rawText: "Just wanted to say — this tool has saved our PM team about 8 hours a week in manual tagging. The AI classification is shockingly accurate. Worth every penny.",
    theme: 'PRAISE' as Theme, sentiment: 'POSITIVE' as Sentiment, summary: "AI classification saves PM team 8 hours weekly, highly accurate", source: 'MANUAL' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "The trend charts are beautiful and actually useful. We showed them in our board meeting and got a lot of questions about where we got the insights. Great job on the design.",
    theme: 'PRAISE' as Theme, sentiment: 'POSITIVE' as Sentiment, summary: "Trend charts praised for design quality and board-level utility", source: 'INTERCOM' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "Your customer support is exceptional. Raised a ticket at 11pm and had a thoughtful response by midnight. Whatever you're doing, keep it up.",
    theme: 'PRAISE' as Theme, sentiment: 'POSITIVE' as Sentiment, summary: "Exceptional support response at 11pm same night", source: 'ZENDESK' as SourceType, productArea: 'Onboarding',
  },
  {
    rawText: "Switched from a competitor 3 months ago. The Zendesk integration alone saves us 2 hours a day. Importing 6 months of historical data in one click was incredible.",
    theme: 'PRAISE' as Theme, sentiment: 'POSITIVE' as Sentiment, summary: "Zendesk integration saves 2 hours daily vs competitor", source: 'MANUAL' as SourceType, productArea: 'Integrations',
  },
  {
    rawText: "The new dark mode is perfect. My eyes don't hurt during late-night sessions anymore. Small thing but it made me realize how much care goes into this product.",
    theme: 'PRAISE' as Theme, sentiment: 'POSITIVE' as Sentiment, summary: "New dark mode praised for late-night usability", source: 'CSV' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "Been using this for 6 months and the product keeps getting better every release. The changelog is well-written and updates actually address real user requests. Refreshing.",
    theme: 'PRAISE' as Theme, sentiment: 'POSITIVE' as Sentiment, summary: "Product consistently improves based on user requests", source: 'INTERCOM' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "The API documentation is the best I've seen from a product in this space. Clear examples, all edge cases covered. Made our integration a 2-day job instead of 2 weeks.",
    theme: 'PRAISE' as Theme, sentiment: 'POSITIVE' as Sentiment, summary: "API documentation praised for clarity and completeness", source: 'MANUAL' as SourceType, productArea: 'API',
  },
  // OTHER feedback
  {
    rawText: "Is there a way to export my data if I decide to cancel? Want to make sure I can take my feedback history with me before committing to an annual plan.",
    theme: 'OTHER' as Theme, sentiment: 'NEUTRAL' as Sentiment, summary: "Data portability question before committing to annual plan", source: 'ZENDESK' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "What's your data retention policy? We're in fintech and need to know if feedback data is stored for at least 7 years for compliance purposes.",
    theme: 'OTHER' as Theme, sentiment: 'NEUTRAL' as Sentiment, summary: "Data retention policy inquiry for fintech compliance needs", source: 'INTERCOM' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "Do you have a referral program? We've recommended you to 3 other companies this quarter and would love some kind of credit or recognition for that.",
    theme: 'OTHER' as Theme, sentiment: 'POSITIVE' as Sentiment, summary: "Referral program inquiry after multiple company recommendations", source: 'MANUAL' as SourceType, productArea: 'Billing',
  },
  {
    rawText: "Are you GDPR compliant? We're based in Germany and need to process a DPA before we can use any SaaS tools. Please send me the necessary documentation.",
    theme: 'OTHER' as Theme, sentiment: 'NEUTRAL' as Sentiment, summary: "GDPR compliance and DPA documentation requested for EU use", source: 'ZENDESK' as SourceType, productArea: 'Dashboard',
  },
  {
    rawText: "Love the product overall but the color scheme feels a bit dated. Any plans to refresh the UI? Would love to see a more modern design.",
    theme: 'OTHER' as Theme, sentiment: 'MIXED' as Sentiment, summary: "Product praised but UI color scheme feels dated", source: 'CSV' as SourceType, productArea: 'Dashboard',
  },
]

async function main() {
  console.log('🌱 Starting database seed...')

  // Create demo organization
  const org = await prisma.organization.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corp',
      slug: 'acme-corp',
    },
  })
  console.log(`✅ Organization: ${org.name}`)

  // Create default product areas
  const productAreas = ['Dashboard', 'Authentication', 'API', 'Billing', 'Onboarding', 'Integrations', 'Mobile', 'Other']
  for (const area of productAreas) {
    await prisma.productArea.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: area.toLowerCase() } },
      update: {},
      create: {
        organizationId: org.id,
        name: area,
        slug: area.toLowerCase(),
      },
    })
  }
  console.log(`✅ Created ${productAreas.length} product areas`)

  // Create demo user
  const user = await prisma.user.upsert({
    where: { email: 'demo@feedbackos.app' },
    update: {},
    create: {
      email: 'demo@feedbackos.app',
      name: 'Demo User',
      emailVerified: new Date(),
    },
  })

  // Add user to org
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    update: {},
    create: {
      organizationId: org.id,
      userId: user.id,
      role: 'OWNER',
    },
  })
  console.log(`✅ Demo user: ${user.email}`)

  // Create system tags
  const systemTags = [
    { name: 'high-priority', color: '#ef4444' },
    { name: 'workaround-available', color: '#f59e0b' },
    { name: 'regression', color: '#dc2626' },
    { name: 'third-party', color: '#8b5cf6' },
    { name: 'positive-feedback', color: '#10b981' },
  ]
  for (const tag of systemTags) {
    await prisma.tag.upsert({
      where: { organizationId_name: { organizationId: org.id, name: tag.name } },
      update: {},
      create: { organizationId: org.id, name: tag.name, color: tag.color, isSystemTag: true },
    })
  }

  // Seed 50 feedback items with classifications
  const now = new Date()
  for (let i = 0; i < sampleFeedback.length; i++) {
    const item = sampleFeedback[i]
    // Distribute across last 12 weeks
    const daysAgo = Math.floor(Math.random() * 84) // 0-84 days ago
    const submittedAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)

    const existing = await prisma.feedbackItem.findFirst({
      where: { organizationId: org.id, rawText: item.rawText },
    })
    if (existing) continue

    const confidence = 0.65 + Math.random() * 0.35 // 0.65 - 1.0
    const feedbackItem = await prisma.feedbackItem.create({
      data: {
        organizationId: org.id,
        source: item.source,
        rawText: item.rawText,
        submittedAt,
        status: confidence < 0.7 ? 'NEEDS_REVIEW' : 'CLASSIFIED',
        externalId: `seed-${i + 1}`,
        metadata: { seeded: true },
      },
    })

    await prisma.classification.create({
      data: {
        feedbackId: feedbackItem.id,
        theme: item.theme,
        sentiment: item.sentiment,
        productArea: item.productArea,
        confidenceScore: confidence,
        summary: item.summary,
        requiresHumanReview: confidence < 0.7,
        modelUsed: 'gpt-4o-mini-2024-07-18',
        promptTokens: 350 + Math.floor(Math.random() * 200),
        completionTokens: 120 + Math.floor(Math.random() * 80),
        classifiedAt: new Date(submittedAt.getTime() + 1500 + Math.random() * 500),
        rawLlmResponse: {
          theme: item.theme.toLowerCase(),
          sentiment: item.sentiment.toLowerCase(),
          product_area: item.productArea,
          confidence,
          summary: item.summary,
          requires_human_review: confidence < 0.7,
        },
      },
    })
  }

  const total = await prisma.feedbackItem.count({ where: { organizationId: org.id } })
  console.log(`✅ Seeded ${total} feedback items with classifications`)
  console.log('\n🎉 Seed complete!')
  console.log(`\n   Org ID: ${org.id}`)
  console.log(`   Demo user: demo@feedbackos.app`)
}

main()
  .then(async () => { await prisma.$disconnect() })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
