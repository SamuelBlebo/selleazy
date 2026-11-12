import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { limit, orderBy, query, where } from 'firebase/firestore';
import { PayBadge, StatusBadge, itemsText } from '@/components/orders/OrderBits';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Drawer, EmptyState, Icon, SearchInput, Select, Textarea } from '@/components/ui';
import { customersRef, ordersRef } from '@/firebase';
import { useCollection } from '@/hooks/useCollection';
import { useOrg, usePermission } from '@/hooks/usePermission';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/useToast';
import { saveCustomerNote, sendBroadcast } from '@/services';
import type { Customer, WithId } from '@/types';
import { toMessage } from '@/utils/errors';
import { money, formatPhone, shortWhen } from '@/utils/format';

export function CustomersPage() {
  usePageTitle('Customers');
  const { org } = useOrg();
  const canBroadcast = usePermission('broadcasts.send');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const list = useCollection(useMemo(() => query(customersRef(org.id), orderBy('lastMessageAt', 'desc'), limit(500)), [org.id]));
  const all = list.status === 'ready' ? list.data : [];
  const needle = q.trim().toLowerCase();
  const rows = all.filter((c) => !needle || `${c.name ?? ''} ${c.phone} ${c.address ?? ''}`.toLowerCase().includes(needle));
  const selected = params.get('c');

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <PageHeader
        title="Customers"
        description={`Everyone who has messaged ${org.name}. Customers never need an account.`}
        actions={canBroadcast && <Button onClick={() => setBroadcasting(true)}><Icon name="send" /> Send a promotion</Button>}
      />
      <div className="mb-4"><SearchInput value={q} onChange={setQ} placeholder="Name, number or area" /></div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="hidden grid-cols-[minmax(180px,2fr)_80px_130px_120px_110px] gap-4 bg-raised px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted md:grid">
          <span>Customer</span><span className="text-right">Orders</span><span className="text-right">Spent</span><span>Last message</span><span>Tag</span>
        </div>
        {list.status === 'ready' && rows.length === 0 && <EmptyState title="No customers yet" description="Customers appear here the first time they message your WhatsApp number." />}
        {rows.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setParams({ c: c.id })}
            className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-left first:border-t-0 hover:bg-[#FBF6EC] md:grid-cols-[minmax(180px,2fr)_80px_130px_120px_110px]"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">{c.name ?? c.waProfileName ?? 'Unnamed'}</span>
              <span className="tabular block text-[13px] text-muted">{formatPhone(c.phone)}{c.address ? ` · ${c.address.split(',')[0]}` : ''}</span>
            </span>
            <span className="tabular hidden text-right md:block">{c.orderCount}</span>
            <span className="tabular text-right">{money(c.totalSpentMinor)}</span>
            <span className="tabular hidden text-muted md:block">{shortWhen(c.lastMessageAt)}</span>
            <span className="hidden md:block">{c.orderCount >= 5 ? <Badge tone="ok">Regular</Badge> : c.orderCount <= 1 ? <Badge tone="brand">New</Badge> : <Badge>Returning</Badge>}</span>
          </button>
        ))}
      </div>
      <CustomerDrawer customer={all.find((c) => c.id === selected) ?? null} onClose={() => setParams({})} />
      {canBroadcast && <BroadcastDrawer open={broadcasting} customers={all} onClose={() => setBroadcasting(false)} />}
    </div>
  );
}

function CustomerDrawer({ customer, onClose }: { customer: WithId<Customer> | null; onClose: () => void }) {
  const { org } = useOrg();
  const toast = useToast();
  const canWrite = usePermission('customers.write');
  const [note, setNote] = useState<string | null>(null);
  const orders = useCollection(useMemo(() => (customer ? query(ordersRef(org.id), where('customerId', '==', customer.id), orderBy('createdAt', 'desc'), limit(20)) : null), [org.id, customer]));
  if (!customer) return null;
  const value = note ?? customer.note ?? '';
  return (
    <Drawer
      open
      title={customer.name ?? customer.waProfileName ?? formatPhone(customer.phone)}
      onClose={() => { setNote(null); onClose(); }}
      footer={
        <>
          <Link to={`/chats/${customer.id}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-line2 px-4 text-sm font-semibold hover:bg-raised"><Icon name="chat" /> Open chat</Link>
          {canWrite && (
            <Button onClick={async () => {
              try {
                await saveCustomerNote(org.id, customer.id, value);
                toast.success('Note saved.');
              } catch (e) {
                toast.error(toMessage(e));
              }
            }}>Save note</Button>
          )}
        </>
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">WhatsApp</dt><dd className="tabular text-right">{formatPhone(customer.phone)}</dd>
        {customer.address && (<><dt className="text-muted">Address</dt><dd className="text-right">{customer.address}</dd></>)}
        <dt className="text-muted">Orders</dt><dd className="tabular text-right">{customer.orderCount}</dd>
        <dt className="text-muted">Spent</dt><dd className="tabular text-right">{money(customer.totalSpentMinor)}</dd>
        <dt className="text-muted">First message</dt><dd className="text-right">{shortWhen(customer.createdAt)}</dd>
      </dl>
      {canWrite && <div className="mt-4"><Textarea label="Private note" placeholder="Only your team sees this" value={value} onChange={(e) => setNote(e.target.value)} /></div>}
      <h3 className="mb-2 mt-5 font-semibold">Orders</h3>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {orders.status === 'ready' && orders.data.length === 0 && <p className="p-4 text-sm text-muted">No orders yet.</p>}
        {orders.status === 'ready' && orders.data.map((o) => (
          <Link key={o.id} to={`/orders?order=${o.id}`} className="grid grid-cols-[56px_1fr_auto] gap-3 border-t border-line px-4 py-2.5 text-sm first:border-t-0 hover:bg-raised">
            <span className="tabular font-semibold">#{o.number}</span>
            <span className="min-w-0"><span className="block truncate">{itemsText(o)}</span><span className="mt-1 flex gap-1.5"><StatusBadge order={o} /><PayBadge order={o} /></span></span>
            <span className="tabular">{money(o.totalMinor)}</span>
          </Link>
        ))}
      </div>
    </Drawer>
  );
}

function BroadcastDrawer({ open, customers, onClose }: { open: boolean; customers: WithId<Customer>[]; onClose: () => void }) {
  const { org } = useOrg();
  const toast = useToast();
  const [audience, setAudience] = useState<'all' | 'regulars' | 'lapsed'>('all');
  const [message, setMessage] = useState(`Hello from ${org.name}! `);
  const [busy, setBusy] = useState(false);
  const month = Date.now() - 30 * 86400000;
  const groups = {
    all: customers,
    regulars: customers.filter((c) => c.orderCount >= 5),
    lapsed: customers.filter((c) => c.orderCount > 0 && (c.lastOrderAt?.toMillis() ?? 0) < month),
  };
  const target = groups[audience].slice(0, 300);
  const allowed = ['growth', 'pro'].includes(org.subscription.plan);
  return (
    <Drawer
      open={open}
      title="Send a promotion"
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!allowed || !target.length || message.trim().length < 5} loading={busy} onClick={async () => {
        setBusy(true);
        try {
          const r = await sendBroadcast(message.trim(), target.map((c) => c.id));
          toast.success(`Sent to ${r.sentCount}. ${r.failedCount ? `${r.failedCount} could not be reached.` : ''}`);
          onClose();
        } catch (e) {
          toast.error(toMessage(e));
        } finally {
          setBusy(false);
        }
      }}><Icon name="send" /> Send to {target.length}</Button></>}
    >
      {!allowed && <p className="mb-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-ink">Promotions are on the Growth plan and above. <Link to="/settings/plan" className="font-semibold underline">See plans</Link></p>}
      <div className="space-y-3">
        <Select label="Who gets it" value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
          <option value="all">Everyone ({groups.all.length})</option>
          <option value="regulars">Regulars, 5+ orders ({groups.regulars.length})</option>
          <option value="lapsed">Haven't ordered in 30 days ({groups.lapsed.length})</option>
        </Select>
        <Textarea label="Message" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
        <p className="text-sm text-muted">
          WhatsApp only delivers free text to customers who messaged you in the last 24 hours. Reaching everyone else needs a Meta-approved promotion template. Up to 300 people, 3 sends an hour.
        </p>
      </div>
    </Drawer>
  );
}
