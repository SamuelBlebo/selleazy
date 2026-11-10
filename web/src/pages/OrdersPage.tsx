import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { limit, orderBy, query, where } from 'firebase/firestore';
import { DraftCard } from '@/components/orders/DraftCard';
import { NextStepButton, OrderDrawer, PayBadge, StatusBadge, itemsText } from '@/components/orders/OrderBits';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Drawer, EmptyState, Icon, Input, SearchInput, Segmented, Select, Textarea } from '@/components/ui';
import { FULFILMENT_LABEL, fulfilmentOptions, isOpen } from '@/config/business';
import { useLive } from '@/context/LiveContext';
import { draftOrdersRef, ordersRef } from '@/firebase';
import { useCollection } from '@/hooks/useCollection';
import { useOrg } from '@/hooks/usePermission';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/useToast';
import { createManualOrder } from '@/services';
import type { Fulfilment, Order, WithId } from '@/types';
import { cn } from '@/utils/cn';
import { toMessage } from '@/utils/errors';
import { cedis, formatDate, shortWhen } from '@/utils/format';

type Tab = 'new' | 'active' | 'bookings' | 'drafts' | 'done' | 'cancelled';

export function OrdersPage() {
  const { org } = useOrg();
  const isServices = org.businessType === 'services';
  usePageTitle(isServices ? 'Bookings' : 'Orders');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const tab = (params.get('tab') as Tab) || 'new';
  const openId = params.get('order');
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const orders = useCollection(useMemo(() => query(ordersRef(org.id), orderBy('createdAt', 'desc'), limit(300)), [org.id]));
  const drafts = useCollection(useMemo(() => query(draftOrdersRef(org.id), where('status', '==', 'open'), limit(50)), [org.id]));
  const all = orders.status === 'ready' ? orders.data : [];

  const F: Record<Exclude<Tab, 'drafts'>, (o: Order) => boolean> = {
    new: (o) => o.status === 'pending',
    active: (o) => isOpen(o.status) && o.status !== 'pending',
    bookings: (o) => o.hasServices && isOpen(o.status),
    done: (o) => o.status === 'completed',
    cancelled: (o) => o.status === 'cancelled',
  };
  const tabs: Array<{ value: Tab; label: string; count: number }> = [
    { value: 'new', label: 'New', count: all.filter(F.new).length },
    { value: 'active', label: 'In progress', count: all.filter(F.active).length },
    ...(org.features.bookings ? [{ value: 'bookings' as Tab, label: 'Upcoming bookings', count: all.filter(F.bookings).length }] : []),
    { value: 'drafts', label: 'Typed orders', count: drafts.status === 'ready' ? drafts.data.length : 0 },
    { value: 'done', label: 'Done', count: all.filter(F.done).length },
    { value: 'cancelled', label: 'Cancelled', count: all.filter(F.cancelled).length },
  ];

  let rows: WithId<Order>[] = tab === 'drafts' ? [] : all.filter(F[tab]);
  if (tab === 'bookings') rows = [...rows].sort((a, b) => (a.appointmentAt?.toMillis() ?? Infinity) - (b.appointmentAt?.toMillis() ?? Infinity));
  const needle = q.trim().toLowerCase();
  if (needle) rows = rows.filter((o) => `${o.number} ${o.customerName} ${o.customerPhone}`.toLowerCase().includes(needle));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <PageHeader
        title={isServices ? 'Bookings' : 'Orders'}
        description="Everything from WhatsApp and the counter, newest first. Tap one to move it along."
        actions={<Button onClick={() => setCreating(true)}><Icon name="plus" /> New {isServices ? 'booking' : 'order'}</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={tab} onChange={(v) => setParam('tab', v)} options={tabs} />
        {tab !== 'drafts' && <SearchInput value={q} onChange={setQ} placeholder="Number, name or phone" />}
      </div>

      {tab === 'drafts' ? (
        drafts.status === 'ready' && drafts.data.length ? (
          <div className="space-y-2">
            {drafts.data.map((d) => (
              <div key={d.id}>
                <Link to={`/chats/${d.customerId}`} className="mx-auto block max-w-[560px] text-sm font-semibold text-brand-ink hover:underline">
                  {d.customerName ?? d.customerId} · open chat
                </Link>
                <DraftCard draft={d} />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-surface"><EmptyState title="No typed orders waiting" description="When a customer types an order in their own words, SellEazy drafts it here for you to confirm." /></div>
        )
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="hidden grid-cols-[64px_minmax(140px,1.2fr)_minmax(160px,2fr)_110px_120px_150px_150px] gap-3.5 bg-raised px-4 py-2.5 font-cap text-[11px] font-semibold uppercase tracking-[0.12em] text-muted lg:grid">
            <span>#</span><span>Customer</span><span>Items</span><span className="text-right">Total</span><span>Payment</span><span>Status</span><span />
          </div>
          {orders.status === 'loading' && <p className="p-6 text-muted">Loading…</p>}
          {orders.status === 'ready' && rows.length === 0 && <EmptyState title="Nothing here right now" description="New orders from WhatsApp appear here the moment they're placed." />}
          {rows.map((o) => (
            <div
              key={o.id}
              role="button"
              tabIndex={0}
              onClick={() => setParam('order', o.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setParam('order', o.id)}
              className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3.5 gap-y-1 border-t border-line px-4 py-3 first:border-t-0 hover:bg-[#FBF6EC] lg:grid-cols-[64px_minmax(140px,1.2fr)_minmax(160px,2fr)_110px_120px_150px_150px]"
            >
              <span className="tabular col-start-1 row-start-1 font-semibold lg:col-auto lg:row-auto">
                #{o.number}
                <small className="block font-normal text-muted">{tab === 'bookings' && o.appointmentAt ? formatDate(o.appointmentAt) : shortWhen(o.createdAt)}</small>
              </span>
              <span className="col-start-1 lg:col-auto">
                {o.customerName}
                <small className="block text-[13px] text-muted">{FULFILMENT_LABEL[o.fulfilment]}{o.deliveryAddress ? ` · ${o.deliveryAddress.split(',')[0]}` : ''}</small>
              </span>
              <span className="col-span-2 text-sm text-muted lg:col-span-1 lg:text-base lg:text-ink">{itemsText(o)}</span>
              <span className="tabular col-start-2 row-start-1 text-right font-semibold lg:col-auto lg:row-auto lg:font-normal">{cedis(o.totalMinor)}</span>
              <span className="col-start-1 lg:col-auto"><PayBadge order={o} /></span>
              <span className="col-start-2 text-right lg:col-auto lg:text-left"><StatusBadge order={o} /></span>
              <span className={cn('hidden justify-end lg:flex')}><NextStepButton order={o} /></span>
            </div>
          ))}
        </div>
      )}
      <OrderDrawer orderId={openId} onClose={() => setParam('order', null)} />
      <ManualOrderDrawer open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setParam('order', id); }} />
    </div>
  );
}

function ManualOrderDrawer({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { org } = useOrg();
  const live = useLive();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', phone: '', address: '', when: '', note: '' });
  const [lines, setLines] = useState<Array<{ itemId: string; quantity: number }>>([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const item = (id: string) => live.items.find((i) => i.id === id);
  const hasProducts = lines.length === 0 || lines.some((l) => item(l.itemId)?.kind === 'product');
  const options = fulfilmentOptions(org.features, hasProducts);
  const [fulfilment, setFulfilment] = useState<Fulfilment>(options[0]);
  const f = options.includes(fulfilment) ? fulfilment : options[0];
  const total = lines.reduce((s, l) => s + (item(l.itemId)?.priceMinor ?? 0) * l.quantity, 0) + (f === 'delivery' ? org.deliveryFeeMinor : 0);

  const submit = async () => {
    if (!form.name || form.phone.replace(/\D/g, '').length < 9) return toast.error('Add the customer name and phone.');
    if (!lines.length) return toast.error('Add at least one item.');
    setBusy(true);
    try {
      const r = await createManualOrder({
        customerName: form.name,
        customerPhone: form.phone,
        lines,
        fulfilment: f,
        address: form.address || null,
        appointmentAt: form.when ? new Date(form.when).toISOString() : null,
        note: form.note || null,
      });
      toast.success(`#${r.number} created.`);
      setForm({ name: '', phone: '', address: '', when: '', note: '' });
      setLines([]);
      onCreated(r.orderId);
    } catch (e) {
      toast.error(toMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      title="New order"
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => void submit()}>Create · {cedis(total)}</Button></>}
    >
      <p className="mb-4 text-sm text-muted">For orders taken by phone or in person. Stock is set aside straight away.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Customer name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input label="Phone (WhatsApp)" inputMode="tel" placeholder="024 000 0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>
      <div className="mt-4 space-y-2">
        <span className="block text-sm font-semibold">Items</span>
        {lines.map((l, i) => (
          <div key={l.itemId} className="flex items-center gap-2">
            <span className="flex-1">{item(l.itemId)?.name}</span>
            <input type="number" min={1} max={99} value={l.quantity} aria-label="Quantity" onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))} className="h-9 w-16 rounded-lg border border-line2 bg-white px-2 text-center" />
            <button type="button" aria-label="Remove" onClick={() => setLines(lines.filter((_, k) => k !== i))} className="grid h-9 w-9 place-items-center rounded-full hover:bg-raised"><Icon name="x" /></button>
          </div>
        ))}
        <div className="flex gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Choose an item" className="h-10 min-w-0 flex-1 rounded-xl border border-line2 bg-white px-3 text-sm">
            <option value="">Choose…</option>
            {live.items.filter((i) => i.active && !lines.some((l) => l.itemId === i.id)).map((i) => (
              <option key={i.id} value={i.id}>{i.name} · {cedis(i.priceMinor)}</option>
            ))}
          </select>
          <Button variant="secondary" disabled={!pick} onClick={() => { setLines([...lines, { itemId: pick, quantity: 1 }]); setPick(''); }}>Add</Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Select label="How" value={f} onChange={(e) => setFulfilment(e.target.value as Fulfilment)}>
          {options.map((o) => <option key={o} value={o}>{FULFILMENT_LABEL[o]}</option>)}
        </Select>
        {(f === 'delivery' || f === 'on_site') && <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />}
        {!hasProducts || lines.some((l) => item(l.itemId)?.kind === 'service') ? (
          <Input type="datetime-local" label="Booking time" value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} />
        ) : null}
      </div>
      <div className="mt-4"><Textarea label="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
    </Drawer>
  );
}
