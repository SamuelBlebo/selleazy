import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui';
import { PLANS } from '@/config/plans';
import { whatsappLink } from '@/config/site';
import type { FaqItem } from '@/pages/marketing/FaqPage';
import { cn } from '@/utils/cn';
import { money } from '@/utils/format';

/*
 * Building blocks for the public pages (home, pricing, FAQ, help, legal).
 * One fixed brand palette, separate from the dashboard's theme tokens:
 * forest #0E3B2E, gold #F5B82E, cream #FBF6EC, ink #14231D.
 */

export const CTA =
  'inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

/** The dark green band at the top of every inner public page. */
export function PageHero({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-[#0E3B2E] text-white">
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-40 h-[420px] w-[420px] rounded-full bg-[#F5B82E]/10 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#F5B82E]">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-[3.4rem]">{title}</h1>
        {sub && <div className="mt-5 max-w-2xl text-lg text-white/75">{sub}</div>}
        {children}
      </div>
    </section>
  );
}

export function SectionHead({ eyebrow, title, sub, center }: { eyebrow: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#B7791F]">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight sm:text-[2.6rem]">{title}</h2>
      {sub && <p className="mt-4 text-lg text-[#4A5A53]">{sub}</p>}
    </div>
  );
}

/** Plans straight from config/plans.ts, so prices are written in one place. */
export function PricingCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {PLANS.map((p) => {
        const featured = p.id === 'growth';
        return (
          <article key={p.id} className={cn('relative flex flex-col rounded-3xl p-6', featured ? 'bg-[#0E3B2E] text-white shadow-xl' : 'border border-[#E8DFCC] bg-white')}>
            {featured && <span className="absolute -top-3 left-6 rounded-full bg-[#F5B82E] px-3 py-1 text-xs font-bold text-[#14231D]">Recommended</span>}
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <p className="mt-3 font-display text-4xl font-bold tabular">
              {p.priceMinor ? money(p.priceMinor, 'GHS').replace('.00', '') : 'Free'}
              {p.priceMinor > 0 && <span className={cn('text-sm font-medium', featured ? 'text-white/60' : 'text-[#5B6B64]')}> / month</span>}
            </p>
            <ul className="mt-6 space-y-2.5 text-[15px]">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Icon name="check" className={cn('mt-0.5 h-4 w-4 shrink-0', featured ? 'text-[#F5B82E]' : 'text-[#0B7A6B]')} />
                  {f}
                </li>
              ))}
            </ul>
            <Link to="/signup" className={cn(CTA, 'mt-8 h-11 w-full', featured ? 'bg-[#F5B82E] text-[#14231D] hover:bg-[#FFC94D]' : 'border border-[#14231D]/15 hover:bg-[#F4EDDE]')}>
              {p.priceMinor ? 'Start free' : 'Get started'}
            </Link>
          </article>
        );
      })}
    </div>
  );
}

export function FaqList({ items, firstOpen }: { items: FaqItem[]; firstOpen?: boolean }) {
  return (
    <div className="divide-y divide-[#E8DFCC] rounded-3xl border border-[#E8DFCC] bg-white">
      {items.map((f, i) => (
        <details key={f.question} open={firstOpen && i === 0} className="group px-6 py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
            {f.question}
            <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#F4EDDE] text-lg leading-none transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 text-[#4A5A53]">{f.answer}</p>
        </details>
      ))}
    </div>
  );
}

/** The gold "start free" band that closes most public pages. */
export function FinalCta({ title = 'Your next order is a message away.', sub = 'Set up SellEazy today, free. Keep your number, keep your customers.' }: { title?: string; sub?: string }) {
  const wa = whatsappLink();
  return (
    <section className="px-4 pb-20 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[#F5B82E] px-6 py-14 text-center sm:py-20">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/25 blur-2xl" />
        <h2 className="relative font-display text-3xl font-bold tracking-tight sm:text-5xl">{title}</h2>
        <p className="relative mx-auto mt-4 max-w-lg text-lg text-[#14231D]/75">{sub}</p>
        <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/signup" className={cn(CTA, 'bg-[#0E3B2E] text-white hover:bg-[#14503F] focus-visible:ring-[#0E3B2E] focus-visible:ring-offset-[#F5B82E]')}>
            Start free <Icon name="arrow" className="h-4 w-4" />
          </Link>
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className={cn(CTA, 'border border-[#14231D]/25 hover:bg-white/30')}>
              Chat with us on WhatsApp
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

/** Long-form text (help, privacy, terms) on a white card under a PageHero. */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto -mt-8 max-w-3xl px-4 pb-20 sm:px-6">
      <div className="relative rounded-3xl border border-[#E8DFCC] bg-white p-6 shadow-sm sm:p-10 [&_a]:text-[#0B7A6B] [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[#14231D] [&_li]:text-[15px] [&_p]:text-[15px] [&_p]:leading-relaxed">
        {children}
      </div>
    </div>
  );
}
