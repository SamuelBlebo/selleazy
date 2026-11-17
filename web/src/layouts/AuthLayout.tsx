import { Outlet } from 'react-router-dom';
import { Logo } from '@/components/layout/Logo';

const POINTS = ['Keep your WhatsApp Business number', 'Orders, bookings and MoMo in one place', 'Free for your first 15 orders a month'];

export function AuthLayout() {
  return (
    <div className="grid min-h-screen bg-[#FBF6EC] lg:grid-cols-[1fr_minmax(440px,520px)]">
      {/* Left panel carries the pitch; it collapses away on small screens. */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#0E3B2E] p-10 text-white lg:flex">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full bg-[#F5B82E]/10 blur-3xl" />
        <Logo light />
        <div className="relative max-w-md">
          <p className="font-display text-4xl font-bold leading-tight tracking-tight">
            Sell on WhatsApp. Get paid by <span className="text-[#F5B82E]">MoMo</span>. Never miss an order.
          </p>
          <ul className="mt-8 space-y-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-3 text-white/85">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#F5B82E] text-xs font-bold text-[#14231D]">✓</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/60">Made for shops, food sellers and service providers in Ghana.</p>
      </section>

      <section className="flex flex-col p-6 sm:p-10">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-sm">
            <Outlet />
          </div>
        </div>
      </section>
    </div>
  );
}
