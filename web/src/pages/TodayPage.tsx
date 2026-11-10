import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { orderBy, query, Timestamp, where } from 'firebase/firestore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Icon, type IconName } from '@/components/ui';
import { isOpen } from '@/config/business';
import { useLive } from '@/context/LiveContext';
import { ordersRef } from '@/firebase';
import { useCollection } from '@/hooks/useCollection';
import { useAuth } from '@/hooks/useAuth';
import { useOrg, usePermission } from '@/hooks/usePermission';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/utils/cn';
import { cedis, formatDate, startOfToday } from '@/utils/format';

interface Need {
  icon: IconName;
  tone: 'accent' | 'brand' | 'danger';
  title: string;
  detail: string;
  to: string;
  cta: string;
}

export function TodayPage() {
  usePageTitle('Today');
  const { org, role, words } = useOrg();
  const { profile } = useAuth();
  const live = useLive();
  const canPay = usePermission('payments.verify');
  const bookings = useCollection(
    useMemo(() => {
      const start = startOfToday();
      return query(
        ordersRef(org.id),
        where('appointmentAt', '>=', Timestamp.fromDate(start)),
        where('appointmentAt', '<', Timestamp.fromMillis(start.getTime() + 86400000)),
        orderBy('appointmentAt'),
      );
    }, [org.id]),
  );
  if (role === 'kitchen') return <Navigate to="/kitchen" replace />;

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = live.todayOrders.filter((o) => o.status !== 'cancelled');
  const open = today.filter((o) => isOpen(o.status));
  const paid = today.filter((o) => o.paymentState === 'paid');
  const upcoming = (bookings.status === 'ready' ? bookings.data : []).filter((o) => isOpen(o.status)).slice(0, 8);

  const setup = [
    { done: org.whatsapp.connected, label: 'Connect your WhatsApp number', to: '/settings/whatsapp' },
    { done: live.items.length > 0, label: `Add your first ${words.item}`, to: '/catalog?new=1' },
    { done: Boolean(org.momo.mtn || org.momo.telecel || org.momo.airteltigo), label: 'Add the MoMo numbers customers pay to', to: '/settings/momo' },
  ];
  const setupLeft = setup.filter((s) => !s.done);

  const needs: Need[] = [];
  if (canPay && live.paymentsToCheck)
    needs.push({ icon: 'wallet', tone: 'accent', title: `${live.paymentsToCheck} MoMo payment${live.paymentsToCheck > 1 ? 's' : ''} to check`, detail: 'Match each Transaction ID with your MoMo SMS.', to: '/payments', cta: 'Check' });
  if (live.openDrafts)
    needs.push({ icon: 'spark', tone: 'brand', title: `${live.openDrafts} typed ${live.openDrafts > 1 ? 'orders' : 'order'} to confirm`, detail: 'SellEazy read them from chat. Check they are right.', to: '/orders?tab=drafts', cta: 'Review' });
  if (live.needsReply)
    needs.push({ icon: 'chat', tone: 'brand', title: `${live.needsReply} chat${live.needsReply > 1 ? 's' : ''} waiting for you`, detail: 'The bot handed these to a person.', to: '/chats', cta: 'Reply' });
  const fresh = open.filter((o) => o.status === 'pending' && o.paymentState === 'unpaid').length;
  if (fresh) needs.push({ icon: 'orders', tone: 'accent', title: `${fresh} new ${words.order}${fresh > 1 ? 's' : ''} not paid yet`, detail: 'Confirm them, or wait for the MoMo payment.', to: '/orders', cta: 'Open' });
  for (const item of live.lowStock.slice(0, 3))
    needs.push({ icon: 'alert', tone: item.stock === 0 ? 'danger' : 'accent', title: item.stock === 0 ? `${item.name} is sold out` : `${item.name} is running low (${item.stock} left)`, detail: item.stock === 0 ? 'Customers cannot order it on WhatsApp.' : 'Restock it or switch it off.', to: '/catalog', cta: 'Open' });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
      <PageHeader title={`${greet}, ${profile?.fullName.split(' ')[0] ?? ''}`} description={`Here's ${org.name} today.`} />

      {setupLeft.length > 0 && (
        <section className="mb-5 rounded-2xl border border-accent/50 bg-surface p-5">
          <h2 className="font-semibold">Finish setting up ({setup.length - setupLeft.length} of {setup.length})</h2>
          <ul className="mt-3 space-y-2">
            {setup.map((s) => (
              <li key={s.label}>
                <Link to={s.to} className={cn('flex items-center gap-3', s.done ? 'text-muted line-through' : 'font-medium hover:underline')}>
                  <span className={cn('grid h-6 w-6 place-items-center rounded-full border', s.done ? 'border-ok bg-ok text-white' : 'border-line2')}>
                    {s.done && <Icon name="check" className="h-4 w-4" />}
                  </span>
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <dl className="mb-5 grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-4">
        {[
          canPay ? ['Taken today', cedis(live.takenTodayMinor), `${paid.length} paid`] : null,
          [`${words.order[0].toUpperCase()}${words.order.slice(1)}s`, String(today.length), `${open.length} still open`],
          canPay ? ['Average', cedis(paid.length ? Math.round(live.takenTodayMinor / paid.length) : 0), 'per paid order'] : null,
          ['To check', String(live.paymentsToCheck + live.openDrafts), 'payments and typed orders'],
        ]
          .filter((x): x is string[] => Boolean(x))
          .map(([label, value, hint], i) => (
            <div key={label} className={cn('border-line px-5 py-4', i % 2 === 1 && 'border-l', i >= 2 && 'border-t sm:border-t-0', i > 0 && 'sm:border-l')}>
              <dt className="cap text-muted">{label}</dt>
              <dd className="tabular mt-1.5 text-xl font-semibold">{value}</dd>
              <p className="text-xs text-muted">{hint}</p>
            </div>
          ))}
      </dl>

      <section className="overflow-hidden rounded-2xl border border-line bg-surface" aria-labelledby="needs">
        <h2 id="needs" className="border-b border-line px-5 py-3.5 font-semibold">Needs you now</h2>
        {needs.length === 0 ? (
          <p className="px-5 py-10 text-center text-muted">All clear. Nothing needs you right now.</p>
        ) : (
          needs.map((n) => (
            <div key={n.title} className="grid grid-cols-[36px_1fr] items-center gap-x-4 gap-y-2 border-t border-line px-5 py-3.5 first:border-t-0 sm:grid-cols-[36px_1fr_auto]">
              <span className={cn('grid h-9 w-9 place-items-center rounded-full', n.tone === 'accent' && 'bg-accent-soft text-accent-ink', n.tone === 'brand' && 'bg-brand-soft text-brand-ink', n.tone === 'danger' && 'bg-danger-soft text-danger')}>
                <Icon name={n.icon} />
              </span>
              <div>
                <p className="font-semibold">{n.title}</p>
                <p className="text-sm text-muted">{n.detail}</p>
              </div>
              <Link to={n.to} className="col-start-2 inline-flex h-8 w-fit items-center rounded-full border border-line2 px-3 text-[13px] font-semibold hover:bg-raised sm:col-start-3">
                {n.cta}
              </Link>
            </div>
          ))
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-3.5 font-semibold">Bookings today</h2>
          {upcoming.map((o) => (
            <Link key={o.id} to={`/orders?order=${o.id}`} className="flex justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0 hover:bg-raised">
              <span>
                <b>{o.customerName}</b> · {o.lines.map((l) => l.name).join(', ')}
              </span>
              <span className="tabular text-muted">{formatDate(o.appointmentAt)}</span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
