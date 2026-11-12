import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { query, where } from 'firebase/firestore';
import { Badge, Button } from '@/components/ui';
import { ordersRef } from '@/firebase';
import { useCollection } from '@/hooks/useCollection';
import { useOrg } from '@/hooks/usePermission';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/useToast';
import { updateOrderStatus } from '@/services';
import type { Order, OrderStatus, WithId } from '@/types';
import { cn } from '@/utils/cn';
import { toMessage } from '@/utils/errors';
import { FULFILMENT_LABEL } from '@/config/business';

/** Food businesses only: big tickets for a tablet on the pass (ShopFlow's Kitchen Display). */
const COLUMNS: Array<{ status: OrderStatus; title: string; action: string; to: OrderStatus }> = [
  { status: 'confirmed', title: 'New', action: 'Start cooking', to: 'in_progress' },
  { status: 'in_progress', title: 'Cooking', action: 'Mark ready', to: 'ready' },
  { status: 'ready', title: 'Ready', action: 'Handed over', to: 'completed' },
];

export function KitchenPage() {
  usePageTitle('Kitchen');
  const { org, role } = useOrg();
  const toast = useToast();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const orders = useCollection(useMemo(() => query(ordersRef(org.id), where('status', 'in', ['confirmed', 'in_progress', 'ready'])), [org.id]));
  if (!org.features.kitchen) return <Navigate to="/today" replace />;
  const all = (orders.status === 'ready' ? orders.data : []).filter((o) => o.hasProducts);

  const move = async (o: WithId<Order>, to: OrderStatus) => {
    try {
      // Kitchen staff can't send out deliveries; a delivery order waits at Ready for the counter.
      if (to === 'completed' && o.fulfilment === 'delivery') {
        toast.success(`#${o.number} is waiting for a rider. The counter sends it out.`);
        return;
      }
      await updateOrderStatus(o.id, to);
    } catch (e) {
      toast.error(toMessage(e));
    }
  };

  return (
    <div className="px-4 py-6 lg:px-8">
      <h1 className="mb-1 text-[28px] font-bold">Kitchen</h1>
      <p className="mb-5 text-muted">Confirmed orders only. Oldest first.</p>
      <div className="grid items-start gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = all.filter((o) => o.status === col.status).sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
          return (
            <section key={col.status}>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">{col.title} <Badge>{list.length}</Badge></h2>
              {list.length === 0 && <p className="rounded-2xl border border-line bg-surface p-6 text-center text-muted">Nothing here.</p>}
              {list.map((o) => {
                const since = (o.statusHistory.find((h) => h.status === col.status)?.at ?? o.createdAt).toMillis();
                const s = Math.max(0, Math.floor((now - since) / 1000));
                const deliveryWaiting = col.status === 'ready' && o.fulfilment === 'delivery';
                return (
                  <article key={o.id} className="mb-3.5 overflow-hidden rounded-2xl border border-line bg-surface">
                    <div className="border-b border-line px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                      #{o.number} · {o.customerName} · {FULFILMENT_LABEL[o.fulfilment]}
                    </div>
                    <ul className="px-4 py-3 text-[19px] font-semibold leading-relaxed">
                      {o.lines.map((l) => (
                        <li key={l.itemId}><b className="tabular inline-block min-w-[34px] text-brand-ink">{l.quantity}×</b>{l.name}</li>
                      ))}
                    </ul>
                    {o.note && <p className="mx-4 mb-2 rounded-lg bg-accent-soft px-3 py-1.5 text-sm text-accent-ink">{o.note}</p>}
                    <div className="flex items-center justify-between gap-2 px-4 pb-3.5">
                      <span className={cn('tabular text-xl font-semibold', s > 1800 ? 'text-danger' : s > 1200 && 'text-accent-ink')}>
                        {String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}
                      </span>
                      {deliveryWaiting ? (
                        <span className="text-sm text-muted">Waiting for rider</span>
                      ) : (role !== 'kitchen' || col.to !== 'completed') ? (
                        <Button size="md" variant={col.status === 'ready' ? 'secondary' : 'ok'} onClick={() => void move(o, col.to)}>{col.action}</Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
