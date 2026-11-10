import { usePageTitle } from '@/hooks/usePageTitle';

const LAST_UPDATED = 'September 7, 2026';

export function TermsOfServicePage() {
  usePageTitle('Terms of Service');
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted">Last updated {LAST_UPDATED}</p>

      <div className="mt-8 space-y-8">
        <section>
          <h2 className="text-base font-semibold text-ink">1. Agreement</h2>
          <p className="mt-2 text-sm text-muted">
            These terms govern your use of SellEazy, a platform that lets merchants take orders from
            customers over WhatsApp. By creating an account, you agree to these terms.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">2. Your account</h2>
          <p className="mt-2 text-sm text-muted">
            You're responsible for keeping your login credentials secure and for all activity under your
            account. You must provide accurate business information when you sign up.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">3. Plans and billing</h2>
          <p className="mt-2 text-sm text-muted">
            SellEazy offers a Free plan and paid plans with higher order and product limits, described on
            our Pricing page. Paid plan prices are in Ghana cedis and billed monthly through
            Paystack (MoMo or card). Downgrading to Free takes effect immediately; we don't offer refunds
            for partial billing periods.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">4. Your WhatsApp connection</h2>
          <p className="mt-2 text-sm text-muted">
            Connecting WhatsApp requires your own Meta WhatsApp Business Account and access token, which
            you provide to us. You remain responsible for complying with Meta's own WhatsApp Business
            Policy, including messaging limits and opt-in requirements for promotional broadcasts. We may
            suspend your WhatsApp integration if we become aware it's being used in a way that violates
            Meta's policies.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">5. Acceptable use</h2>
          <p className="mt-2 text-sm text-muted">
            You agree not to use SellEazy to sell illegal goods or services, to send unsolicited bulk
            messages outside WhatsApp's messaging rules, or to attempt to access another merchant's data.
            We may suspend or terminate accounts that violate this section.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">6. Your data</h2>
          <p className="mt-2 text-sm text-muted">
            You own the product, order and customer data you create using SellEazy. See our{' '}
            <a href="/privacy" className="font-semibold text-brand">
              Privacy Policy
            </a>{' '}
            for how we handle it. You're responsible for how you use your customers' data, including
            complying with any data protection law that applies to your business.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">7. Service availability</h2>
          <p className="mt-2 text-sm text-muted">
            We aim to keep SellEazy available at all times but don't guarantee uninterrupted service.
            We're not responsible for outages caused by third-party services we depend on, including
            Google Firebase and Meta's WhatsApp Cloud API.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">8. Termination</h2>
          <p className="mt-2 text-sm text-muted">
            You can delete your account at any time from Settings. We may suspend or delete accounts that
            violate these terms, or that are inactive on a free plan for an extended period, with notice
            where possible.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">9. Limitation of liability</h2>
          <p className="mt-2 text-sm text-muted">
            SellEazy is provided "as is." To the extent permitted by law, we're not liable for indirect
            or consequential damages arising from your use of the platform, including lost orders or
            revenue from a WhatsApp or infrastructure outage outside our control.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">10. Changes to these terms</h2>
          <p className="mt-2 text-sm text-muted">
            We'll update the date at the top of this page when these terms change, and notify merchants of
            material changes by email.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-ink">11. Contact</h2>
          <p className="mt-2 text-sm text-muted">
            Questions about these terms can be sent to{' '}
            <a href="mailto:legal@selleazy.example" className="font-semibold text-brand">
              legal@selleazy.example
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
