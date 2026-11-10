import { usePageTitle } from '@/hooks/usePageTitle';

const LAST_UPDATED = 'September 7, 2026';

export function PrivacyPolicyPage() {
  usePageTitle('Privacy Policy');
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated {LAST_UPDATED}</p>

      <div className="prose-legal mt-8 space-y-8">
        <section>
          <h2 className="text-base font-semibold text-ink">1. Who this applies to</h2>
          <p className="mt-2 text-sm text-muted">
            This policy covers two kinds of people: merchants who create a SellEazy account to run
            their shop ("merchants," "you"), and the merchant's own customers who place orders over
            WhatsApp ("customers"). SellEazy acts as the data processor for customer order data on
            behalf of the merchant, who remains responsible for how they use it.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">2. Information we collect</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted">
            <li>
              <span className="font-medium text-ink">Merchant account data</span> — name, email address,
              business name, and authentication details, collected when you sign up.
            </li>
            <li>
              <span className="font-medium text-ink">Business data</span> — products, prices, stock levels
              and order records that you or your customers create while using SellEazy.
            </li>
            <li>
              <span className="font-medium text-ink">Customer order data</span> — a customer's WhatsApp
              phone number, name, delivery address and order history, collected when they place an order
              through your WhatsApp number.
            </li>
            <li>
              <span className="font-medium text-ink">Usage data</span> — basic technical logs (timestamps,
              error reports) used to operate and secure the platform.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">3. How we use it</h2>
          <p className="mt-2 text-sm text-muted">
            We use this information to operate the ordering system: routing WhatsApp messages, creating
            and updating orders, sending delivery status updates, calculating your usage against your
            plan, and providing support. We do not sell merchant or customer data to third parties.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">4. Where it's stored and who processes it</h2>
          <p className="mt-2 text-sm text-muted">
            SellEazy is built on Google Firebase (Authentication, Firestore, Cloud Storage and Cloud
            Functions) for data storage and application logic, and Meta's WhatsApp Cloud API to send and
            receive WhatsApp messages. Both are subject to their own privacy and data-processing terms.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">5. Data isolation between merchants</h2>
          <p className="mt-2 text-sm text-muted">
            Every merchant's products, orders and customers are stored in an isolated workspace and are
            never visible to another merchant on the platform.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">6. Data retention and deletion</h2>
          <p className="mt-2 text-sm text-muted">
            We retain account and order data for as long as your account is active. If a merchant account
            is deleted, associated business data is permanently removed from our systems. Merchants are
            responsible for retaining any records they need before requesting deletion.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">7. Your rights</h2>
          <p className="mt-2 text-sm text-muted">
            You can access, correct or request deletion of your account data at any time from Settings, or
            by contacting us. A merchant's customers should direct data requests to the merchant they
            ordered from, who can reach us on their behalf.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">8. Changes to this policy</h2>
          <p className="mt-2 text-sm text-muted">
            We'll update the date at the top of this page when this policy changes, and notify merchants
            of material changes by email.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">9. Contact</h2>
          <p className="mt-2 text-sm text-muted">
            Questions about this policy can be sent to{' '}
            <a href="mailto:privacy@selleazy.example" className="font-semibold text-brand">
              privacy@selleazy.example
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
