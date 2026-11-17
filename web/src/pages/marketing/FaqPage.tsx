import { Link } from 'react-router-dom';
import { FaqList, FinalCta, PageHero } from '@/components/marketing/Marketing';
import { whatsappLink } from '@/config/site';
import { usePageTitle } from '@/hooks/usePageTitle';

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQS: FaqItem[] = [
  {
    question: 'Do my customers need to install anything?',
    answer:
      "No. They message your existing WhatsApp Business number the way they always have. SellEazy answers on your behalf, shows your products or services, and takes the order or booking. There's no app to download and nothing for them to sign up for.",
  },
  {
    question: 'Can I keep my current WhatsApp Business number?',
    answer:
      "Yes. In Settings → WhatsApp choose 'Use my current WhatsApp Business number', sign in with Facebook and scan a QR code with your WhatsApp Business app. You keep using the app on your phone; SellEazy works on the same number through Meta's official WhatsApp Business Platform. When you reply from your phone, the bot steps back for that chat.",
  },
  {
    question: "What happens if I go over my plan's order limit?",
    answer:
      "We'll let you know from the dashboard as you approach your limit. Orders already placed are never blocked — you can upgrade at any time from Settings and the new limit applies immediately.",
  },
  {
    question: 'Can I change plans later?',
    answer:
      'Yes, at any time from Settings. Downgrading to Free applies immediately; moving to a paid plan takes you to a secure Paystack checkout, and the new plan applies as soon as payment goes through.',
  },
  {
    question: 'Is my business data shared with other merchants?',
    answer:
      'No. Every business on SellEazy is fully isolated — your products, orders and customers are only ever visible to your own team.',
  },
  {
    question: 'How do my customers pay me?',
    answer:
      "By mobile money to your own MTN MoMo, Telecel Cash or AirtelTigo Money number, or cash. The customer replies with their Transaction ID; you match it with your MoMo SMS and tap Verify. SellEazy flags wrong amounts and reused IDs. SellEazy never holds your money.",
  },
  {
    question: 'Where is SellEazy available?',
    answer:
      "Ghana, for now. Prices are in cedis and payments use Ghanaian mobile money.",
  },
];

export function FaqPage() {
  usePageTitle('FAQ');
  const wa = whatsappLink();
  return (
    <div className="bg-[#FBF6EC] text-[#14231D]">
      <PageHero eyebrow="FAQ" title="Questions merchants ask us." sub="Straight answers about WhatsApp, payments, plans and your data." />
      <section className="mx-auto -mt-8 max-w-3xl px-4 pb-16 sm:px-6">
        <div className="relative"><FaqList items={FAQS} firstOpen /></div>
        <p className="mt-8 text-center text-[#5B6B64]">
          Still have a question?{' '}
          <Link to="/help" className="font-semibold text-[#0B7A6B] underline-offset-2 hover:underline">Visit the Help Center</Link>
          {wa && (
            <>
              {' '}or <a href={wa} target="_blank" rel="noreferrer" className="font-semibold text-[#0B7A6B] underline-offset-2 hover:underline">ask us on WhatsApp</a>
            </>
          )}
          .
        </p>
      </section>
      <FinalCta />
    </div>
  );
}
