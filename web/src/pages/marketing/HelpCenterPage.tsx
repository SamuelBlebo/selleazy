import { PageHero, Prose } from '@/components/marketing/Marketing';
import { SITE } from '@/config/site';
import { usePageTitle } from '@/hooks/usePageTitle';

interface HelpArticle {
  title: string;
  body: string[];
}

interface HelpSection {
  title: string;
  articles: HelpArticle[];
}

const SECTIONS: HelpSection[] = [
  {
    title: 'Getting started',
    articles: [
      {
        title: 'Create your account',
        body: [
          'Sign up with your work email or a Google account and give your business a name — this creates your organization and a workspace only your team can see.',
          "You'll land in onboarding first if you signed up with Google, so we can collect your business name before opening the dashboard.",
        ],
      },
      {
        title: 'Add your first products',
        body: [
          'From Products, click Add Product to set a name, price, category and stock count, with an optional photo.',
          'Products with zero stock show as out of stock to customers automatically; low stock is flagged in your dashboard so you can restock in time.',
        ],
      },
    ],
  },
  {
    title: 'Connecting WhatsApp',
    articles: [
      {
        title: 'Connecting your number',
        body: [
          "Open Settings → WhatsApp. Choose 'Use my current WhatsApp Business number' to keep using the WhatsApp Business app on your phone, or 'Use a new number' for a number that isn't on WhatsApp yet.",
          "Tap Continue with Facebook and follow Meta's window. For your current number you'll scan a QR code with the WhatsApp Business app. SellEazy never sees your Facebook password.",
        ],
      },
      {
        title: 'Testing the connection',
        body: [
          'Once connected, message your own WhatsApp number with "Hi" from a phone. You should get a welcome reply within a few seconds — that confirms the webhook is live.',
        ],
      },
    ],
  },
  {
    title: 'Orders & delivery',
    articles: [
      {
        title: 'How an order reaches your dashboard',
        body: [
          'A customer messages your number, browses your catalog and confirms a quantity and delivery address entirely inside the chat — no forms, no app.',
          'The order appears in Orders immediately, with the customer, items and total already filled in.',
        ],
      },
      {
        title: 'Updating delivery status',
        body: [
          'Open an order to move it through Preparing, Out for Delivery and Delivered, and optionally assign a rider and an estimated delivery time.',
          'Each status change sends the customer an automatic WhatsApp update, so you never have to message them separately.',
        ],
      },
    ],
  },
  {
    title: 'Customers & promotions',
    articles: [
      {
        title: 'Viewing customer history',
        body: [
          'Customers is built from your order history automatically — no separate customer list to maintain. Open any customer to see their past orders and add a private note your team can see.',
        ],
      },
      {
        title: 'Sending a broadcast',
        body: [
          'Select customers from the list and choose Broadcast to send them a WhatsApp message about a sale or restock.',
          "Customers outside Meta's 24-hour messaging window may not be reachable until they message you again — anyone that couldn't be reached shows up in the results, never silently.",
        ],
      },
    ],
  },
  {
    title: 'Billing & plans',
    articles: [
      {
        title: 'Understanding your limits',
        body: [
          'Every plan has a monthly order limit and a product limit — see Pricing for the full breakdown. Your usage against both is visible from Settings at all times.',
        ],
      },
      {
        title: 'Changing plans',
        body: [
          'Change plans any time from Settings. Downgrading to Free applies immediately; moving to a paid plan opens a secure Paystack checkout, and the new plan applies as soon as payment goes through.',
        ],
      },
    ],
  },
];

export function HelpCenterPage() {
  usePageTitle('Help Center');
  return (
    <div className="bg-[#FBF6EC] text-[#14231D]">
      <PageHero eyebrow="Help Center" title="Get your shop running." sub="Short guides for setting up SellEazy and running it every day.">
        <nav aria-label="Help topics" className="mt-8 flex flex-wrap gap-2">
          {SECTIONS.map((section) => (
            <a key={section.title} href={`#${slug(section.title)}`} className="rounded-full border border-white/20 px-4 py-1.5 text-sm font-medium text-white/85 hover:bg-white/10">
              {section.title}
            </a>
          ))}
        </nav>
      </PageHero>
      <Prose>
        <div className="space-y-12">
          {SECTIONS.map((section) => (
            <section key={section.title} id={slug(section.title)} className="scroll-mt-24">
              <h2>{section.title}</h2>
              <div className="mt-5 space-y-6">
                {section.articles.map((article) => (
                  <div key={article.title}>
                    <h3 className="font-semibold">{article.title}</h3>
                    <div className="mt-1.5 space-y-2 text-[#4A5A53]">
                      {article.body.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="mt-12 rounded-2xl bg-[#F4EDDE] p-6">
          <h2>Still stuck?</h2>
          <p className="mt-1.5 text-[#4A5A53]">
            Email <a href={`mailto:${SITE.supportEmail}`} className="font-semibold">{SITE.supportEmail}</a> and we'll get back to you.
          </p>
        </div>
      </Prose>
    </div>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '-');
