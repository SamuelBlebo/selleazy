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
        title: 'What you need before connecting',
        body: [
          'A WhatsApp Business Account and phone number registered on the Meta WhatsApp Cloud API. If you don\'t have one yet, Meta sets this up through Meta Business Suite.',
          "In SellEazy, open Settings → WhatsApp and tap Continue with Facebook. Pick your business and number in Meta's window. SellEazy never sees your Facebook password; Meta gives SellEazy's server a key it keeps private.",
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
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Help Center</h1>
      <p className="mt-3 text-muted">Short guides for getting your shop running on SellEazy.</p>

      <div className="mt-10 space-y-12">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-bold text-ink">{section.title}</h2>
            <div className="mt-4 space-y-6">
              {section.articles.map((article) => (
                <div key={article.title}>
                  <h3 className="text-sm font-semibold text-ink">{article.title}</h3>
                  <div className="mt-1.5 space-y-2">
                    {article.body.map((paragraph, i) => (
                      <p key={i} className="text-sm text-muted">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-14 rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-base font-semibold text-ink">Still stuck?</h2>
        <p className="mt-1.5 text-sm text-muted">
          Email{' '}
          <a href="mailto:support@selleazy.example" className="font-semibold text-brand">
            support@selleazy.example
          </a>{' '}
          and we'll get back to you.
        </p>
      </div>
    </div>
  );
}
