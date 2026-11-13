import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Mark, Wordmark } from '@/components/layout/Logo';
import { Count, Icon, type IconName } from '@/components/ui';
import { can, ROLE_LABEL, type Permission } from '@/config/permissions';
import { vocabulary } from '@/config/business';
import { planById } from '@/config/plans';
import { LiveProvider, useLive } from '@/context/LiveContext';
import { useAuth } from '@/hooks/useAuth';
import { signOutUser } from '@/services';
import { cn } from '@/utils/cn';
import { initials, setMoneyCurrency } from '@/utils/format';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  count?: number;
}

function useNav(): { items: NavItem[]; tabs: NavItem[] } {
  const { org, profile } = useAuth();
  const live = useLive();
  const role = profile?.role ?? null;
  const words = vocabulary(org!.businessType, org!.category);
  const has = (p: Permission) => can(role, p);
  const items: NavItem[] = [];
  if (role !== 'kitchen') items.push({ to: '/today', label: 'Today', icon: 'today' });
  if (has('inbox.reply')) items.push({ to: '/chats', label: 'Chats', icon: 'chat', count: live.unreadChats });
  if (has('orders.manage')) items.push({ to: '/orders', label: org!.businessType === 'services' ? 'Bookings' : 'Orders', icon: org!.businessType === 'services' ? 'calendar' : 'orders', count: live.openDrafts });
  if (has('payments.verify')) items.push({ to: '/payments', label: 'MoMo checks', icon: 'wallet', count: live.paymentsToCheck });
  if (role !== 'kitchen') items.push({ to: '/catalog', label: words.catalog, icon: org!.businessType === 'services' ? 'scissors' : 'box' });
  if (has('inbox.reply')) items.push({ to: '/customers', label: 'Customers', icon: 'users' });
  if (org!.features.kitchen && has('kitchen.manage')) items.push({ to: '/kitchen', label: 'Kitchen', icon: 'flame' });
  if (has('settings.write')) items.push({ to: '/settings', label: 'Settings', icon: 'sliders' });
  const tabs = items.slice(0, 4);
  return { items, tabs };
}

function Shell() {
  const { org, profile, user } = useAuth();
  const { items, tabs } = useNav();
  const location = useLocation();
  const plan = planById(org!.subscription.plan);
  const inTabs = tabs.some((t) => location.pathname.startsWith(t.to));
  // An open conversation takes the whole phone screen, like WhatsApp.
  const fullScreen = /^\/chats\/[^/]+/.test(location.pathname) ? 'max-md:hidden' : '';
  // On phones the brand bar shows only on Today; other pages lead with their own title.
  const brandBar = location.pathname === '/today' ? '' : 'max-lg:hidden';

  return (
    <div className="grid h-dvh grid-cols-1 overflow-hidden lg:grid-cols-[232px_minmax(0,1fr)]">
      <nav aria-label="Main" className="hidden flex-col overflow-y-auto border-r border-line bg-surface px-3 pb-3 pt-4 lg:flex">
        <NavLink to="/today" className="flex items-center gap-2 px-2 pb-4">
          <Mark size={26} />
          <Wordmark />
        </NavLink>
        <div className="mb-4 rounded-lg border border-line px-3 py-2.5">
          <p className="truncate text-sm font-medium">{org!.name}</p>
          <p className="mt-0.5 text-xs text-muted">
            {plan.name} plan · {org!.subscription.ordersUsedThisPeriod ?? 0} of {plan.orderLimit ?? '∞'} orders
          </p>
        </div>
        <div className="flex flex-col gap-0.5">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-raised text-ink [&_svg]:text-brand' : 'text-muted hover:bg-raised/60 hover:text-ink',
                )
              }
            >
              <Icon name={it.icon} className="h-[18px] w-[18px]" />
              <span className="flex-1">{it.label}</span>
              <Count n={it.count ?? 0} />
            </NavLink>
          ))}
        </div>
        <div className="mt-auto flex items-center gap-2.5 border-t border-line px-1 pt-3 text-sm">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink">{initials(profile?.fullName ?? user?.displayName)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{profile?.fullName}</p>
            <p className="text-xs text-muted">{profile?.role ? ROLE_LABEL[profile.role] : ''}</p>
          </div>
          <button type="button" onClick={() => void signOutUser()} aria-label="Sign out" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink">
            <Icon name="logout" className="h-[18px] w-[18px]" />
          </button>
        </div>
      </nav>

      <div className="flex h-dvh min-w-0 flex-col">
        <header className={cn('flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5 lg:hidden', brandBar)}>
          <NavLink to="/today" className="flex items-center gap-2">
            <Mark size={24} />
            <Wordmark />
          </NavLink>
          <span className="truncate text-sm text-muted">{org!.name}</span>
        </header>
        {org!.suspended && (
          <div className="bg-danger px-4 py-2 text-center text-sm font-semibold text-white">
            Your business is suspended{org!.suspendedReason ? `: ${org!.suspendedReason}` : '.'} WhatsApp orders are paused. Contact SellEazy support.
          </div>
        )}
        <main id="main" className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <nav aria-label="Main" className={cn('grid shrink-0 grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden', fullScreen)}>
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) => cn('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand' : 'text-muted')}
            >
              <Icon name={t.icon} />
              {t.label === 'MoMo checks' ? 'MoMo' : t.label}
              <Count n={t.count ?? 0} className="absolute left-[calc(50%+6px)] top-1 h-[18px] min-w-[18px] text-[10px]" />
            </NavLink>
          ))}
          <NavLink to="/more" className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', !inTabs ? 'text-brand' : 'text-muted')}>
            <Icon name="more" />
            More
          </NavLink>
        </nav>
      </div>
    </div>
  );
}

export function DashboardLayout() {
  const { org } = useAuth();
  setMoneyCurrency(org?.currency);
  return (
    <LiveProvider>
      <Shell />
    </LiveProvider>
  );
}

/** Phone-only list of everything that doesn't fit in the bottom tabs. */
export function MorePage() {
  const { items, tabs } = useNav();
  const rest = items.filter((i) => !tabs.includes(i));
  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-2xl font-semibold">More</h1>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {rest.map((it) => (
          <NavLink key={it.to} to={it.to} className="flex items-center gap-3 border-t border-line px-4 py-3.5 first:border-t-0 hover:bg-raised">
            <Icon name={it.icon} />
            <span className="flex-1 font-medium">{it.label}</span>
            <Icon name="arrow" className="text-muted" />
          </NavLink>
        ))}
        <button type="button" onClick={() => void signOutUser()} className="flex w-full items-center gap-3 border-t border-line px-4 py-3.5 text-left hover:bg-raised">
          <Icon name="logout" />
          <span className="flex-1 font-medium">Sign out</span>
        </button>
      </div>
    </div>
  );
}
