import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';

const WHO = [
  { title: 'Shops', body: 'Fashion, beauty, phones, groceries, pharmacy. Stock goes down by itself as orders come in.' },
  { title: 'Service providers', body: 'Salons, barbers, tailors, repairs, cleaners. Customers book a time in chat; you confirm it.' },
  { title: 'Food sellers', body: 'Restaurants, chop bars, home cooks. Orders flow straight to a kitchen screen.' },
];

const STEPS = [
  { title: 'Add what you sell', body: 'Products or services, with prices and photos. Takes a few minutes.' },
  { title: 'Customers chat to order', body: 'They message your WhatsApp number. SellEazy shows your catalogue, takes the order or booking, and asks for MoMo.' },
  { title: 'You confirm and get paid', body: 'Check the MoMo Transaction ID, tap Verify, and the order moves along with WhatsApp updates to the customer.' },
];

export function LandingPage() {
  usePageTitle('Sell through chat');
  return (
    <div>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-14 sm:pt-20 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Your customers already message you. Let them order and book there too.</h1>
          <p className="mt-5 text-lg text-muted">
            SellEazy turns your WhatsApp number into a shop counter. Orders, bookings, MoMo payments, stock and customers, all in one place. Customers never download an app or make an account.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/signup"><Button>Start free</Button></Link>
            <Link to="/pricing"><Button variant="secondary">See pricing</Button></Link>
          </div>
          <p className="mt-4 text-sm text-muted">Free for your first 15 orders every month. No card needed.</p>
        </div>
        <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[28px] border-8 border-ink bg-[#EFE8DA] shadow-card">
          <div className="bg-[#1F5C4A] px-4 py-3 font-semibold text-white">Efua's Hair Studio</div>
          <div className="space-y-2 p-3 text-sm">
            <p className="ml-auto w-fit max-w-[85%] rounded-xl rounded-tr-sm bg-[#DCEFD0] px-3 py-2">Hi, I want knotless braids Saturday 10am</p>
            <p className="w-fit max-w-[85%] rounded-xl rounded-tl-sm bg-surface px-3 py-2">Thanks! We read your request as:<br />• 1 × Knotless braids (GH₵ 350)<br />Time: Saturday 10am<br /><br />We'll confirm it with you here shortly.</p>
            <p className="w-fit max-w-[85%] rounded-xl rounded-tl-sm bg-surface px-3 py-2">Booking #42 is confirmed for Sat 15 Nov, 10:00. See you then!</p>
            <p className="ml-auto w-fit max-w-[85%] rounded-xl rounded-tr-sm bg-[#DCEFD0] px-3 py-2">Sent the deposit. ID 52816047391</p>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-surface py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-bold tracking-tight">For everyone who sells through chat</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            {WHO.map((w) => (
              <div key={w.title}>
                <h3 className="font-semibold">{w.title}</h3>
                <p className="mt-1.5 text-muted">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-8 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.title}>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-brand">
        <div className="mx-auto max-w-6xl px-6 py-14 text-center text-brand-on">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Set up in about 5 minutes.</h2>
          <p className="mx-auto mt-3 max-w-md text-brand-dim">Create your account, add what you sell, connect WhatsApp.</p>
          <Link to="/signup" className="mt-6 inline-block"><Button variant="secondary">Start free</Button></Link>
        </div>
      </section>
    </div>
  );
}
