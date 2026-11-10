import { Outlet } from 'react-router-dom';
import { Logo } from '@/components/layout/Logo';

export function AuthLayout() {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1fr_minmax(420px,480px)]">
      {/* Left panel carries the pitch; it collapses away on small screens. */}
      <section className="hidden flex-col justify-between bg-brand p-10 text-brand-on lg:flex">
        <Logo light />
        <div className="max-w-md">
          <p className="text-3xl font-bold leading-tight tracking-tight">
            Your customers already message you. Let them order and book there too.
          </p>
          <p className="mt-4 text-brand-dim">
            Add your products or services once. SellEazy answers the chat, takes the order or booking,
            collects the MoMo reference and keeps your stock right. No app or account for the customer.
          </p>
        </div>
        <p className="text-sm text-brand-dim">Built for shops, food sellers and service providers in Ghana.</p>
      </section>

      <section className="flex flex-col p-6 sm:p-10">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="lg:hidden">
            <Logo />
          </div>
          
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <Outlet />
          </div>
        </div>
      </section>
    </div>
  );
}
