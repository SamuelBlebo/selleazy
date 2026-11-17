import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '@/components/layout/Logo';
import { SITE } from '@/config/site';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/utils/cn';

const NAV_LINKS = [
  { to: '/pricing', label: 'Pricing' },
  { to: '/faq', label: 'FAQ' },
  { to: '/help', label: 'Help Center' },
];

const PILL = 'inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold transition-colors';

export function MarketingLayout() {
  const { user, initialising } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);
  const { pathname } = useLocation();
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-[#FBF6EC] text-[#14231D]">
      <header className="sticky top-0 z-30 border-b border-[#E8DFCC] bg-[#FBF6EC]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo />

          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => cn('rounded-full px-3 py-2 text-sm font-medium transition-colors', isActive ? 'text-[#14231D]' : 'text-[#5B6B64] hover:text-[#14231D]')}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {!initialising && user ? (
              <Link to="/dashboard" className={cn(PILL, 'bg-[#0E3B2E] text-white hover:bg-[#14503F]')}>Go to dashboard</Link>
            ) : (
              <>
                <Link to="/login" className={cn(PILL, 'hidden text-[#14231D] hover:bg-[#F4EDDE] sm:inline-flex')}>Log in</Link>
                <Link to="/signup" className={cn(PILL, 'bg-[#0E3B2E] text-white hover:bg-[#14503F]')}>Start free</Link>
              </>
            )}
            <button
              type="button"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="grid h-10 w-10 place-items-center rounded-full text-[#14231D] hover:bg-[#F4EDDE] md:hidden"
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="flex flex-col gap-0.5 border-t border-[#E8DFCC] px-4 py-3 md:hidden">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={close}
                className={({ isActive }) => cn('rounded-lg px-3 py-2.5 text-sm font-semibold', isActive ? 'text-[#0B7A6B]' : 'text-[#5B6B64]')}
              >
                {link.label}
              </NavLink>
            ))}
            {!user && (
              <Link to="/login" onClick={close} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-[#5B6B64]">
                Log in
              </Link>
            )}
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-[#0A2E24] text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-col justify-between gap-10 sm:flex-row">
            <div>
              <Logo light />
              <p className="mt-4 max-w-xs text-sm text-white/60">WhatsApp ordering and MoMo payments for sellers in Ghana.</p>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              <FooterCol title="Product" links={[['/pricing', 'Pricing'], ['/signup', 'Get started'], ['/login', 'Log in']]} />
              <FooterCol title="Support" links={[['/faq', 'FAQ'], ['/help', 'Help Center']]} extra={<a href={`mailto:${SITE.supportEmail}`} className="text-white/80 hover:text-white">{SITE.supportEmail}</a>} />
              <FooterCol title="Legal" links={[['/privacy', 'Privacy Policy'], ['/terms', 'Terms of Service']]} />
            </div>
          </div>

          <p className="mt-12 border-t border-white/10 pt-6 text-xs text-white/50">© {new Date().getFullYear()} SellEazy. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links, extra }: { title: string; links: Array<[string, string]>; extra?: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#F5B82E]">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map(([to, label]) => (
          <li key={to}><Link to={to} className="text-white/80 hover:text-white">{label}</Link></li>
        ))}
        {extra && <li className="break-all">{extra}</li>}
      </ul>
    </div>
  );
}
