import { Link } from 'react-router-dom';
import { Button, Icon } from '@/components/ui';
import { PLANS } from '@/config/plans';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cedis } from '@/utils/format';

export function PricingPage() {
  usePageTitle('Pricing');
  return (
    <section className="mx-auto max-w-6xl px-6 py-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Simple pricing in cedis</h1>
      <p className="mt-3 max-w-xl text-muted">Pay monthly with MoMo or card. Going over your order limit never blocks a customer; we just ask you to upgrade.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => (
          <article key={p.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-semibold">{p.name}</h2>
            <p className="tabular text-3xl font-semibold">{cedis(p.priceMinor).replace('.00', '')}<span className="text-sm font-medium text-muted"> / month</span></p>
            <ul className="space-y-2 text-sm">
              {p.features.map((f) => <li key={f} className="flex gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 text-ok" />{f}</li>)}
            </ul>
            <Link to="/signup" className="mt-auto pt-2"><Button fullWidth variant={p.id === 'starter' ? 'primary' : 'secondary'}>Start free</Button></Link>
          </article>
        ))}
      </div>
    </section>
  );
}
