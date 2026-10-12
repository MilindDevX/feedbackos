import { Metadata } from 'next'
import LegalPage, { CONTACT_EMAIL } from '@/components/ui/LegalPage'

export const metadata: Metadata = { title: 'Privacy Policy — FeedbackOS' }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 12, 2026">
      <p>
        FeedbackOS is an independent portfolio project, not a company. This page explains, in plain language, what it stores,
        why, who helps process it and how to get it removed. Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>What we store</h2>
      <ul>
        <li><strong>Your account:</strong> your email address, and your name and profile picture if you sign in with Google.</li>
        <li><strong>Feedback you add:</strong> the text, plus any submitter name, email or date you include in a form or CSV file.</li>
        <li><strong>Results and activity:</strong> the AI classification of each item and the review actions taken in your workspace.</li>
        <li><strong>CSV files:</strong> stored privately only while an import runs, then deleted. Abandoned uploads are removed within about a day.</li>
        <li><strong>Security records:</strong> short-lived request counters keyed by IP address or a one-way hash of your email, used to stop abuse.</li>
      </ul>

      <h2>How it is used</h2>
      <p>
        Only to run the service: signing you in, classifying feedback by theme, sentiment and product area, showing it to members
        of your workspace and protecting the service from abuse. We do not sell data, show ads, or use tracking or analytics cookies.
        The only cookie is the one that keeps you signed in.
      </p>

      <h2>Who helps process it</h2>
      <ul>
        <li><strong>Vercel</strong> hosts the app, its private file storage and its job queue.</li>
        <li><strong>Neon</strong> hosts the PostgreSQL database.</li>
        <li><strong>Upstash</strong> provides Redis for caching and rate limits.</li>
        <li><strong>Groq</strong> receives the text of each feedback item to return a classification. Its handling is described in Groq&rsquo;s own privacy policy.</li>
        <li><strong>Google</strong> provides Google sign-in and the Gmail account that sends sign-in links.</li>
      </ul>
      <p>These providers may process data in the United States.</p>

      <h2>How long it is kept</h2>
      <p>
        Account and workspace data stay until you ask for deletion. Sign-in sessions expire after 30 days (two hours for the demo).
        Sign-in links work once and expire after 24 hours.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Download your workspace&rsquo;s feedback at any time with <strong>Export</strong>.</li>
        <li>Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from your account address to delete your account or workspace, or to ask what is stored about you.</li>
      </ul>

      <h2>Please don&rsquo;t upload</h2>
      <p>
        Passwords, payment card numbers, health records or other highly sensitive personal data. FeedbackOS is built for product
        feedback and is not intended for children under 16.
      </p>

      <h2>The public demo</h2>
      <p>The demo workspace contains only made-up sample feedback and is read-only. Visiting it stores no personal data beyond a short session.</p>

      <h2>Changes</h2>
      <p>If this policy changes, the date at the top changes too. Significant changes will be noted on the sign-in page.</p>
    </LegalPage>
  )
}
