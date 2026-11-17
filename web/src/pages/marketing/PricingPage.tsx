import { FaqList, FinalCta, PageHero, PricingCards, SectionHead } from '@/components/marketing/Marketing';
import { usePageTitle } from '@/hooks/usePageTitle';
import { FAQS } from '@/pages/marketing/FaqPage';

/** Billing questions only; the full list lives on /faq. */
const BILLING_FAQS = FAQS.filter((f) => /plan|limit|pay/i.test(f.question));

export function PricingPage() {
  usePageTitle('Pricing');
  return (
    <div className="bg-[#FBF6EC] text-[#14231D]">
      <PageHero
        eyebrow="Pricing"
        title="Simple pricing in cedis."
        sub="Start free. Pay monthly with MoMo or card when you grow. Going over your order limit never blocks a customer; we just ask you to upgrade."
      />
      <section className="mx-auto -mt-10 max-w-6xl px-4 pb-20 sm:px-6">
        <div className="relative">
          <PricingCards />
        </div>
        <p className="mt-6 text-center text-sm text-[#5B6B64]">All plans include WhatsApp ordering, your catalogue, orders and customers in one place.</p>
      </section>
      {BILLING_FAQS.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
          <SectionHead center eyebrow="Questions" title="About plans and billing" />
          <div className="mt-10"><FaqList items={BILLING_FAQS} /></div>
        </section>
      )}
      <FinalCta title="Try it free today." sub="Your first 15 orders every month are on us. No card needed." />
    </div>
  );
}
