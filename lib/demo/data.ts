// ABOUTME: Sample feedback for the public read-only demo workspace, already classified (no AI calls).
// ABOUTME: Synthetic text for a fictional B2B analytics product; spread over ~11 weeks so trends have shape.
import type { FeedbackStatus, Sentiment, SourceType, Theme } from '@prisma/client'

export interface DemoItem {
  daysAgo: number
  source: SourceType
  status: FeedbackStatus
  theme: Theme
  secondary?: Theme[]
  sentiment: Sentiment
  area: string
  confidence: number
  text: string
  summary: string
}

export const DEMO_ITEMS: DemoItem[] = [
  { daysAgo: 0.1, source: 'MANUAL', status: 'NEEDS_REVIEW', theme: 'BUG_PROBLEM', sentiment: 'NEGATIVE', area: 'Billing', confidence: 0.54, text: 'We were charged twice this month and the second invoice has no line items at all.', summary: 'Duplicate charge with an empty second invoice.' },
  { daysAgo: 0.4, source: 'MANUAL', status: 'CLASSIFIED', theme: 'FEATURE_REQUEST', secondary: ['PRAISE'], sentiment: 'MIXED', area: 'Dashboard', confidence: 0.88, text: 'The new filters are great, but please let me save a filter combination so I do not rebuild it every morning.', summary: 'Filters praised; saved filter combinations requested.' },
  { daysAgo: 0.9, source: 'CSV', status: 'CLASSIFIED', theme: 'USABILITY_ISSUE', secondary: ['PRAISE'], sentiment: 'MIXED', area: 'Onboarding', confidence: 0.84, text: 'Setup took ten minutes, which is amazing. Finding where to invite teammates afterwards took me another twenty.', summary: 'Fast setup praised; inviting teammates is hard to find.' },
  { daysAgo: 1.2, source: 'API', status: 'CLASSIFIED', theme: 'QUESTION_SUPPORT', sentiment: 'NEUTRAL', area: 'API', confidence: 0.93, text: 'Is there a rate limit on the export endpoint? Our nightly job sometimes gets a 429.', summary: 'Asks about export endpoint rate limits.' },
  { daysAgo: 1.8, source: 'MANUAL', status: 'REVIEWED', theme: 'PRAISE', sentiment: 'POSITIVE', area: 'Dashboard', confidence: 0.95, text: 'The weekly trend chart made our roadmap review so much easier. Thank you!', summary: 'Trend chart made roadmap review easier.' },
  { daysAgo: 2.3, source: 'CSV', status: 'CLASSIFIED', theme: 'BUG_PROBLEM', sentiment: 'NEGATIVE', area: 'Integrations', confidence: 0.86, text: 'The Slack notification links open a 404 page since yesterday.', summary: 'Slack notification links lead to a 404.' },
  { daysAgo: 3.1, source: 'MANUAL', status: 'CLASSIFIED', theme: 'FEATURE_REQUEST', sentiment: 'NEUTRAL', area: 'Integrations', confidence: 0.9, text: 'Would love a HubSpot integration so feedback shows up on the customer record.', summary: 'HubSpot integration requested.' },
  { daysAgo: 3.7, source: 'CSV', status: 'NEEDS_REVIEW', theme: 'OTHER', sentiment: 'NEUTRAL', area: 'Other', confidence: 0.45, text: 'Please see attached.', summary: 'Message refers to a missing attachment.' },
  { daysAgo: 4.4, source: 'MANUAL', status: 'CLASSIFIED', theme: 'BUG_PROBLEM', secondary: ['PRAISE'], sentiment: 'MIXED', area: 'API', confidence: 0.82, text: 'Your API docs are the best I have used, but the pagination cursor breaks after page 50.', summary: 'API docs praised; pagination breaks after page 50.' },
  { daysAgo: 5.2, source: 'API', status: 'CLASSIFIED', theme: 'USABILITY_ISSUE', sentiment: 'NEGATIVE', area: 'Dashboard', confidence: 0.81, text: 'Dashboard takes about ten seconds to load on Monday mornings.', summary: 'Dashboard slow to load at peak times.' },
  { daysAgo: 6.0, source: 'CSV', status: 'CLASSIFIED', theme: 'PRAISE', sentiment: 'POSITIVE', area: 'Onboarding', confidence: 0.92, text: 'Onboarding was smooth, we were live in a day.', summary: 'Onboarding smooth; live within a day.' },
  { daysAgo: 7.5, source: 'MANUAL', status: 'CLASSIFIED', theme: 'QUESTION_SUPPORT', sentiment: 'NEUTRAL', area: 'Authentication', confidence: 0.91, text: 'Can we enforce SSO for everyone in our workspace?', summary: 'Asks how to enforce SSO for the workspace.' },
  { daysAgo: 8.3, source: 'CSV', status: 'CLASSIFIED', theme: 'BUG_PROBLEM', sentiment: 'NEGATIVE', area: 'Authentication', confidence: 0.87, text: 'Magic links expire before they arrive when our mail server is slow.', summary: 'Magic links expire before slow emails arrive.' },
  { daysAgo: 9.6, source: 'MANUAL', status: 'REVIEWED', theme: 'FEATURE_REQUEST', sentiment: 'NEUTRAL', area: 'Dashboard', confidence: 0.89, text: 'Please add a dark mode, we work late.', summary: 'Dark mode requested.' },
  { daysAgo: 11.0, source: 'API', status: 'CLASSIFIED', theme: 'PRAISE', sentiment: 'POSITIVE', area: 'API', confidence: 0.94, text: 'Webhooks have been rock solid for three months now.', summary: 'Webhooks reliable for three months.' },
  { daysAgo: 12.4, source: 'CSV', status: 'CLASSIFIED', theme: 'USABILITY_ISSUE', sentiment: 'NEGATIVE', area: 'Billing', confidence: 0.83, text: 'I could not find where to download past invoices for our accountant.', summary: 'Past invoices are hard to find.' },
  { daysAgo: 13.9, source: 'MANUAL', status: 'CLASSIFIED', theme: 'FEATURE_REQUEST', secondary: ['PRAISE'], sentiment: 'MIXED', area: 'Integrations', confidence: 0.85, text: 'Love the Zapier app. Could it also trigger when a review is completed?', summary: 'Zapier app praised; review-completed trigger requested.' },
  { daysAgo: 15.2, source: 'CSV', status: 'CLASSIFIED', theme: 'BUG_PROBLEM', sentiment: 'NEGATIVE', area: 'Dashboard', confidence: 0.88, text: 'CSV export cuts off rows after 1,000 every single time.', summary: 'CSV export truncates after 1,000 rows.' },
  { daysAgo: 17.0, source: 'MANUAL', status: 'CLASSIFIED', theme: 'QUESTION_SUPPORT', sentiment: 'NEUTRAL', area: 'Billing', confidence: 0.9, text: 'Do you offer annual billing with a discount for nonprofits?', summary: 'Asks about annual nonprofit discount.' },
  { daysAgo: 19.3, source: 'CSV', status: 'CLASSIFIED', theme: 'PRAISE', sentiment: 'POSITIVE', area: 'Dashboard', confidence: 0.93, text: 'Our support lead says the review queue saves her team six hours a week.', summary: 'Review queue saves the support team six hours weekly.' },
  { daysAgo: 21.5, source: 'API', status: 'NEEDS_REVIEW', theme: 'BUG_PROBLEM', sentiment: 'NEGATIVE', area: 'API', confidence: 0.57, text: 'Some events arrive twice and some never arrive. Hard to tell which.', summary: 'Events duplicated or missing intermittently.' },
  { daysAgo: 24.0, source: 'MANUAL', status: 'CLASSIFIED', theme: 'USABILITY_ISSUE', sentiment: 'NEGATIVE', area: 'Onboarding', confidence: 0.8, text: 'The CSV import wizard did not say which column it expected for dates.', summary: 'CSV import wizard unclear about date column.' },
  { daysAgo: 27.4, source: 'CSV', status: 'CLASSIFIED', theme: 'FEATURE_REQUEST', sentiment: 'NEUTRAL', area: 'Dashboard', confidence: 0.88, text: 'Could we pin a saved view to the top of the dashboard?', summary: 'Pinned saved views requested.' },
  { daysAgo: 30.5, source: 'MANUAL', status: 'CLASSIFIED', theme: 'PRAISE', secondary: ['FEATURE_REQUEST'], sentiment: 'POSITIVE', area: 'Integrations', confidence: 0.86, text: 'The Intercom sync is magic. If it handled tags too it would be perfect.', summary: 'Intercom sync praised; tag support requested.' },
  { daysAgo: 34.0, source: 'CSV', status: 'CLASSIFIED', theme: 'BUG_PROBLEM', sentiment: 'NEGATIVE', area: 'Billing', confidence: 0.85, text: 'Changing seats mid-month produced a negative invoice.', summary: 'Mid-month seat change created a negative invoice.' },
  { daysAgo: 38.2, source: 'API', status: 'CLASSIFIED', theme: 'QUESTION_SUPPORT', sentiment: 'NEUTRAL', area: 'API', confidence: 0.92, text: 'Which API version should new integrations target?', summary: 'Asks which API version to target.' },
  { daysAgo: 42.6, source: 'MANUAL', status: 'CLASSIFIED', theme: 'USABILITY_ISSUE', sentiment: 'NEGATIVE', area: 'Authentication', confidence: 0.82, text: 'Two-factor setup kicked me out twice before it worked.', summary: 'Two-factor setup signs users out repeatedly.' },
  { daysAgo: 47.0, source: 'CSV', status: 'CLASSIFIED', theme: 'PRAISE', sentiment: 'POSITIVE', area: 'Other', confidence: 0.91, text: 'Your support team answered within five minutes on a Sunday. Impressive.', summary: 'Support answered within minutes on a Sunday.' },
  { daysAgo: 51.3, source: 'MANUAL', status: 'CLASSIFIED', theme: 'FEATURE_REQUEST', sentiment: 'NEUTRAL', area: 'API', confidence: 0.87, text: 'Please add a sandbox environment for testing webhooks.', summary: 'Webhook sandbox environment requested.' },
  { daysAgo: 55.8, source: 'CSV', status: 'CLASSIFIED', theme: 'BUG_PROBLEM', secondary: ['PRAISE'], sentiment: 'MIXED', area: 'Dashboard', confidence: 0.83, text: 'Great charts overall, but the date picker shows the wrong week number in January.', summary: 'Charts praised; date picker week number wrong in January.' },
  { daysAgo: 60.1, source: 'API', status: 'CLASSIFIED', theme: 'USABILITY_ISSUE', sentiment: 'NEGATIVE', area: 'Billing', confidence: 0.81, text: 'The upgrade button is hidden in the settings footer.', summary: 'Upgrade button hidden in settings footer.' },
  { daysAgo: 64.5, source: 'MANUAL', status: 'CLASSIFIED', theme: 'PRAISE', sentiment: 'POSITIVE', area: 'Dashboard', confidence: 0.94, text: 'This replaced three spreadsheets for our product team.', summary: 'Replaced three spreadsheets for the product team.' },
  { daysAgo: 68.0, source: 'CSV', status: 'CLASSIFIED', theme: 'QUESTION_SUPPORT', sentiment: 'NEUTRAL', area: 'Onboarding', confidence: 0.9, text: 'Is there a template for importing feedback from Typeform?', summary: 'Asks for a Typeform import template.' },
  { daysAgo: 71.4, source: 'MANUAL', status: 'CLASSIFIED', theme: 'BUG_PROBLEM', sentiment: 'NEGATIVE', area: 'Integrations', confidence: 0.86, text: 'Zendesk sync stops after the first 100 tickets.', summary: 'Zendesk sync stops after 100 tickets.' },
  { daysAgo: 74.9, source: 'CSV', status: 'CLASSIFIED', theme: 'FEATURE_REQUEST', sentiment: 'NEUTRAL', area: 'Dashboard', confidence: 0.88, text: 'Let us share a read-only dashboard link with executives.', summary: 'Read-only dashboard sharing requested.' },
  { daysAgo: 77.2, source: 'API', status: 'CLASSIFIED', theme: 'OTHER', sentiment: 'NEUTRAL', area: 'Other', confidence: 0.7, text: 'Our procurement team needs your W-9 form.', summary: 'Procurement requests a W-9 form.' },
]
