import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CTA, FaqList, FinalCta, PricingCards, SectionHead } from '@/components/marketing/Marketing';
import { Icon } from '@/components/ui';
import { whatsappLink } from '@/config/site';
import { usePageTitle } from '@/hooks/usePageTitle';
import { FAQS } from '@/pages/marketing/FaqPage';
import { cn } from '@/utils/cn';

/*
 * The public home page. Its own fixed palette (forest green, gold, cream), so
 * it reads as a brand page rather than the dashboard. Every claim here must
 * match what SellEazy does today; nothing invented (no fake numbers or quotes).
 */

/** Real merchant quotes go here once pilots agree to be named. Empty = section hidden. */
const TESTIMONIALS: Array<{ quote: string; name: string; business: string }> = [];

export function LandingPage() {
  usePageTitle('Sell on WhatsApp, get paid by MoMo');
  return (
    <div className="bg-[#FBF6EC] text-[#14231D]">
      <Hero />
      <TrustStrip />
      <Problem />
      <HowItWorks />
      <ByBusiness />
      <Trust />
      <Testimonials />
      <Pricing />
      <Faq />
      <FinalCta />
    </div>
  );
}

/* ---------------------------------- Hero ---------------------------------- */

function Hero() {
  const wa = whatsappLink();
  return (
    <section className="relative overflow-hidden bg-[#0E3B2E] text-white">
      <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#F5B82E]/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-32 h-[420px] w-[420px] rounded-full bg-[#25D366]/10 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.15fr_1fr] lg:pb-28">
        <div>
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[13px] font-medium text-white/80">
            <span className="h-1.5 w-1.5 rounded-full bg-[#25D366]" aria-hidden />
            Made for sellers in Ghana
          </p>
          <h1 className="font-display text-[2.6rem] font-bold leading-[1.02] tracking-tight sm:text-6xl">
            Sell on WhatsApp.
            <br />
            Get paid by <span className="text-[#F5B82E]">MoMo</span>.
            <br />
            Never miss an order.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">
            SellEazy answers your customers, takes their orders and bookings, and keeps your MoMo payments and stock in order. Keep the WhatsApp Business number your customers already know.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link to="/signup" className={cn(CTA, 'bg-[#F5B82E] text-[#14231D] hover:bg-[#FFC94D] focus-visible:ring-[#F5B82E] focus-visible:ring-offset-[#0E3B2E]')}>
              Start free <Icon name="arrow" className="h-4 w-4" />
            </Link>
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className={cn(CTA, 'border border-white/25 text-white hover:bg-white/10 focus-visible:ring-white focus-visible:ring-offset-[#0E3B2E]')}>
                <Icon name="chat" className="h-4 w-4" /> Chat with us on WhatsApp
              </a>
            )}
          </div>
          <p className="mt-5 text-sm text-white/60">Free for your first 15 orders every month. No card needed.</p>
        </div>
        <PhoneDemo />
      </div>
    </section>
  );
}

type Bubble = { from: 'customer' | 'shop'; body: ReactNode; buttons?: string[] };

const DEMO: Bubble[] = [
  { from: 'customer', body: '2 jollof with chicken abeg. Deliver to East Legon' },
  { from: 'shop', body: <>Got it:<br />2 × Jollof with chicken · GH₵ 90<br />Delivery · GH₵ 15<br /><b>Total GH₵ 105</b></>, buttons: ['Confirm', 'Change'] },
  { from: 'customer', body: 'Confirm' },
  { from: 'shop', body: <>Order #128 placed. Pay <b>GH₵ 105</b> to MTN MoMo 024 *** 8802 and send the Transaction ID.</> },
  { from: 'customer', body: 'Sent. ID 52816047391' },
  { from: 'shop', body: <>Payment confirmed ✓<br />Your food is on the way.</> },
];

function PhoneDemo() {
  return (
    <div className="relative mx-auto w-full max-w-[340px]" aria-label="Example: a customer orders jollof on WhatsApp and pays by MoMo" role="img">
      <div className="overflow-hidden rounded-[2.2rem] border-[7px] border-[#08241C] bg-[#ECE5DD] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.55)]">
        <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3 text-white">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#F5B82E] text-sm font-bold text-[#14231D]">AK</span>
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold">Auntie Kate's Kitchen</span>
            <span className="block text-xs text-white/70">online</span>
          </span>
        </div>
        <div className="flex min-h-[430px] flex-col gap-2 p-3 text-[13.5px] leading-snug text-[#14231D]">
          {DEMO.map((b, i) => (
            <div key={i} className="animate-rise" style={{ animationDelay: `${300 + i * 900}ms` } as CSSProperties}>
              <div className={cn('w-fit max-w-[85%] rounded-xl px-3 py-2 shadow-sm', b.from === 'customer' ? 'ml-auto rounded-tr-sm bg-[#D9FDD3]' : 'rounded-tl-sm bg-white')}>
                {b.body}
              </div>
              {b.buttons && (
                <div className="mt-1 flex max-w-[85%] gap-1">
                  {b.buttons.map((t) => <span key={t} className="flex-1 rounded-lg bg-white py-1.5 text-center text-[13px] font-semibold text-[#0B7A6B] shadow-sm">{t}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-6 -right-4 hidden animate-rise rounded-2xl bg-white px-4 py-3 text-[#14231D] shadow-xl sm:block" style={{ animationDelay: '5900ms' }}>
        <p className="text-xs font-medium text-[#5B6B64]">New order</p>
        <p className="font-display text-lg font-bold">#128 · GH₵ 105</p>
        <p className="text-xs font-semibold text-[#0B7A6B]">Paid ✓</p>
      </div>
    </div>
  );
}

function TrustStrip() {
  const items = ['Official WhatsApp Business Platform', 'MTN MoMo', 'Telecel Cash', 'AirtelTigo Money', 'Prices in cedis'];
  return (
    <div className="border-b border-[#E8DFCC] bg-[#F4EDDE]">
      <ul className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-8 gap-y-2 px-4 py-5 text-sm font-medium text-[#4A5A53] sm:px-6">
        {items.map((t) => <li key={t} className="flex items-center gap-2"><Icon name="check" className="h-4 w-4 text-[#0B7A6B]" />{t}</li>)}
      </ul>
    </div>
  );
}

/* --------------------------------- Sections -------------------------------- */

function Problem() {
  const pains = [
    { icon: 'clock' as const, title: 'Replying at 11pm', body: '"How much?" "Do you deliver?" "Is it available?" The same questions, all day and all night.' },
    { icon: 'wallet' as const, title: 'Checking MoMo SMS by hand', body: 'Scrolling messages to match who paid what, and hoping nobody sent a fake screenshot.' },
    { icon: 'box' as const, title: 'Stock in your head', body: 'Selling the last one twice, or telling a customer "finished" when you still have some.' },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
      <SectionHead eyebrow="Sound familiar?" title="Your customers love WhatsApp. Running a business on it is hard." />
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {pains.map((p) => (
          <article key={p.title} className="rounded-3xl border border-[#E8DFCC] bg-white p-7">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#FDF0D2] text-[#B7791F]"><Icon name={p.icon} className="h-5 w-5" /></span>
            <h3 className="mt-5 text-lg font-semibold">{p.title}</h3>
            <p className="mt-2 text-[#4A5A53]">{p.body}</p>
          </article>
        ))}
      </div>
      <p className="mt-10 font-display text-2xl font-bold tracking-tight">SellEazy takes care of it, on the number you already use.</p>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { title: 'Connect your WhatsApp', body: 'Sign in with Facebook and scan a QR code with your WhatsApp Business app. You keep using the app on your phone.' },
    { title: 'Add what you sell', body: 'Products, dishes or services, with prices and photos. A few minutes, from your phone.' },
    { title: 'Customers order and pay in chat', body: 'They see your menu, build a cart, choose delivery or pickup, and pay by MoMo. You get the order on your dashboard.' },
  ];
  return (
    <section className="bg-[#0E3B2E] text-white">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#F5B82E]">How it works</p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight sm:text-[2.6rem]">Live in an afternoon. No new app for your customers.</h2>
        </div>
        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((s, i) => (
            <li key={s.title} className="relative">
              <span className="font-display text-6xl font-bold text-[#F5B82E]/90">{i + 1}</span>
              <h3 className="mt-3 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-white/70">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

type Kind = 'food' | 'shops' | 'services';

const KINDS: Record<Kind, { label: string; who: string; points: string[]; chat: Bubble[] }> = {
  food: {
    label: 'Food',
    who: 'Restaurants, chop bars, home cooks',
    points: ['Your menu with photos, right in the chat', 'Orders go straight to a kitchen screen', 'Delivery fee added on its own', 'Opening hours: the bot tells late customers when you open'],
    chat: [
      { from: 'customer', body: 'Menu please' },
      { from: 'shop', body: <>Today's menu 🍲<br />Jollof with chicken · GH₵ 45<br />Waakye special · GH₵ 40<br />Banku & tilapia · GH₵ 70</> },
    ],
  },
  shops: {
    label: 'Shops',
    who: 'Fashion, beauty, phones, groceries',
    points: ['Stock goes down by itself as orders come in', 'Customers never buy what you no longer have', 'Low-stock alerts on your dashboard', 'Every customer and order saved in one place'],
    chat: [
      { from: 'customer', body: 'Do you still have the black sneakers size 42?' },
      { from: 'shop', body: <>Yes, 3 left · GH₵ 280.<br />Want me to add 1 to your cart?</>, buttons: ['Add to cart'] },
    ],
  },
  services: {
    label: 'Services',
    who: 'Salons, barbers, tailors, repairs',
    points: ['Customers ask for a time in their own words', 'You confirm every booking before it is final', 'See your day at a glance', 'Updates sent to the customer on WhatsApp'],
    chat: [
      { from: 'customer', body: 'Knotless braids on Saturday 10am?' },
      { from: 'shop', body: <>Booking #42 · Knotless braids<br />Sat 10:00 · GH₵ 350<br />We'll confirm it here shortly.</> },
    ],
  },
};

function ByBusiness() {
  const [kind, setKind] = useState<Kind>('food');
  const k = KINDS[kind];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
      <SectionHead eyebrow="Built for how you sell" title="One tool for food, shops and services." />
      <div role="tablist" aria-label="Business type" className="mt-10 inline-flex rounded-full bg-[#EFE6D3] p-1">
        {(Object.keys(KINDS) as Kind[]).map((id) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={kind === id}
            onClick={() => setKind(id)}
            className={cn('rounded-full px-5 py-2 text-sm font-semibold transition-colors', kind === id ? 'bg-[#0E3B2E] text-white' : 'text-[#4A5A53] hover:text-[#14231D]')}
          >
            {KINDS[id].label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-8 grid items-center gap-10 rounded-[2rem] border border-[#E8DFCC] bg-white p-6 sm:p-10 lg:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-[#5B6B64]">{k.who}</p>
          <ul className="mt-5 space-y-4">
            {k.points.map((p) => (
              <li key={p} className="flex gap-3 text-[17px]">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#DDF5E6] text-[#0B7A6B]"><Icon name="check" className="h-3.5 w-3.5" /></span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div key={kind} className="space-y-2 rounded-3xl bg-[#ECE5DD] p-5 text-[14px] leading-snug">
          {k.chat.map((b, i) => (
            <div key={i} className="animate-rise" style={{ animationDelay: `${i * 350}ms` }}>
              <div className={cn('w-fit max-w-[85%] rounded-xl px-3 py-2 shadow-sm', b.from === 'customer' ? 'ml-auto rounded-tr-sm bg-[#D9FDD3]' : 'rounded-tl-sm bg-white')}>{b.body}</div>
              {b.buttons && <span className="mt-1 inline-block rounded-lg bg-white px-4 py-1.5 text-[13px] font-semibold text-[#0B7A6B] shadow-sm">{b.buttons[0]}</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Trust() {
  const items = [
    { icon: 'wallet' as const, title: 'Your money goes straight to you', body: 'Customers pay your own MoMo number. SellEazy never holds your money.' },
    { icon: 'alert' as const, title: 'Fake payments get flagged', body: 'Wrong amounts and reused Transaction IDs are marked before you verify.' },
    { icon: 'users' as const, title: 'A person confirms what the bot guessed', body: 'When a customer types an order in their own words, you check it before it counts.' },
    { icon: 'card' as const, title: 'Your data stays yours', body: "Your customers and orders are only visible to your team. Never shared with other businesses." },
  ];
  return (
    <section className="border-y border-[#E8DFCC] bg-[#F4EDDE]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <SectionHead eyebrow="Payments and trust" title="Built so you never lose an order or a cedi." />
        <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {items.map((t) => (
            <div key={t.title} className="flex gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#0E3B2E] text-[#F5B82E]"><Icon name={t.icon} className="h-5 w-5" /></span>
              <div>
                <h3 className="text-lg font-semibold">{t.title}</h3>
                <p className="mt-1.5 text-[#4A5A53]">{t.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  if (!TESTIMONIALS.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <SectionHead eyebrow="Sellers on SellEazy" title="In their words." />
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <figure key={t.name} className="rounded-3xl border border-[#E8DFCC] bg-white p-7">
            <blockquote className="text-lg">"{t.quote}"</blockquote>
            <figcaption className="mt-4 text-sm text-[#5B6B64]"><b className="text-[#14231D]">{t.name}</b> · {t.business}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
      <SectionHead center eyebrow="Pricing" title="Start free. Upgrade when you're busy." sub="Pay monthly with MoMo or card. Going over your limit never blocks a customer's order." />
      <div className="mt-12"><PricingCards /></div>
    </section>
  );
}

function Faq() {
  return (
    <section className="mx-auto max-w-3xl px-4 pb-20 sm:px-6 sm:pb-24">
      <SectionHead center eyebrow="Questions" title="Good to know" />
      <div className="mt-10"><FaqList items={FAQS.slice(0, 6)} /></div>
      <p className="mt-6 text-center text-sm text-[#5B6B64]">
        More answers in the <Link to="/faq" className="font-semibold text-[#0B7A6B] underline-offset-2 hover:underline">FAQ</Link> and <Link to="/help" className="font-semibold text-[#0B7A6B] underline-offset-2 hover:underline">Help Center</Link>.
      </p>
    </section>
  );
}
