import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Button } from '@/components/ui';
import { Logo } from '@/components/layout/Logo';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/utils/cn';

const NAV_LINKS = [
  { to: '/pricing', label: 'Pricing' },
  { to: '/faq', label: 'FAQ' },
  { to: '/help', label: 'Help Center' },
];

export function MarketingLayout() {
  const { user, initialising } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
          <Link to="/" onClick={() => setMenuOpen(false)}>
            <Logo />
          </Link>

          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                    isActive ? 'text-brand' : 'text-muted hover:text-ink',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            
            {!initialising && user ? (
              <Link to="/dashboard">
                <Button size="sm">Go to dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden sm:block">
                  <Button variant="ghost" size="sm">
                    Log in
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm">Get started free</Button>
                </Link>
              </>
            )}
            <button
              type="button"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-lg text-ink md:hidden"
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="flex flex-col gap-0.5 border-t border-line px-6 py-3 md:hidden">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2.5 text-sm font-semibold',
                    isActive ? 'text-brand' : 'text-muted',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
            {!user && (
              <Link to="/login" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-semibold text-muted">
                Log in
              </Link>
            )}
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col justify-between gap-8 sm:flex-row">
            <div>
              <Logo />
              <p className="mt-3 max-w-xs text-sm text-muted">
                WhatsApp ordering for shops across Ghana and West Africa.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Product</p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li><Link to="/pricing" className="text-ink hover:text-brand">Pricing</Link></li>
                  <li><Link to="/signup" className="text-ink hover:text-brand">Get started</Link></li>
                  <li><Link to="/login" className="text-ink hover:text-brand">Log in</Link></li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Support</p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li><Link to="/faq" className="text-ink hover:text-brand">FAQ</Link></li>
                  <li><Link to="/help" className="text-ink hover:text-brand">Help Center</Link></li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Legal</p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li><Link to="/privacy" className="text-ink hover:text-brand">Privacy Policy</Link></li>
                  <li><Link to="/terms" className="text-ink hover:text-brand">Terms of Service</Link></li>
                </ul>
              </div>
            </div>
          </div>

          <p className="mt-10 text-xs text-muted">© {new Date().getFullYear()} SellEazy. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
