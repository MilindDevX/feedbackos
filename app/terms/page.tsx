import { Metadata } from 'next'
import LegalPage, { CONTACT_EMAIL } from '@/components/ui/LegalPage'

export const metadata: Metadata = { title: 'Terms of Use — FeedbackOS' }

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="October 12, 2026">
      <p>
        FeedbackOS is a free portfolio project run by one person. By using it you agree to these terms. If you do not agree,
        please don&rsquo;t use it. Contact: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Your content</h2>
      <p>
        Feedback you add stays yours. You allow FeedbackOS to store and process it, including sending it to the AI provider
        described in the <a href="/privacy">Privacy Policy</a>, only to provide the service to you. Only add feedback you have the right to share.
      </p>

      <h2>Fair use</h2>
      <ul>
        <li>One workspace per person, with daily limits on new feedback and request limits on every feature.</li>
        <li>No attempts to break, overload, scrape or get around those limits, and no access to other people&rsquo;s workspaces.</li>
        <li>No illegal content, malware, or highly sensitive personal data (see the Privacy Policy).</li>
      </ul>
      <p>Accounts that break these rules may be suspended or removed.</p>

      <h2>AI results</h2>
      <p>
        Classifications are produced automatically and can be wrong. Low-confidence results are flagged for review, but check
        anything important yourself before acting on it.
      </p>

      <h2>No guarantees</h2>
      <p>
        The service is provided &ldquo;as is&rdquo;, without warranties of any kind. It may change, pause or shut down, and data may be lost.
        Keep your own copies using Export. To the extent the law allows, FeedbackOS and its author are not liable for any indirect
        or consequential loss arising from its use.
      </p>

      <h2>Ending use</h2>
      <p>You can stop using FeedbackOS at any time and ask for your data to be deleted by email.</p>

      <h2>Changes</h2>
      <p>These terms may be updated; the date at the top shows the latest version. Continuing to use the service means you accept the update.</p>
    </LegalPage>
  )
}
