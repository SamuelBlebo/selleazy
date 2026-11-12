import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Drawer, Icon, Input, Select, Textarea, type Tone } from '@/components/ui';
import { actionLabel, FULFILMENT_LABEL, isOpen, nextStatus, statusLabel } from '@/config/business';
import { useDocument } from '@/hooks/useDocument';
import { useOrg, usePermission } from '@/hooks/usePermission';
import { useToast } from '@/hooks/useToast';
import { orderRef } from '@/firebase';
import { recordPayment, setAppointment, setOrderNote, updateOrderStatus } from '@/services';
import type { Order, OrderStatus, WithId } from '@/types';
import { toMessage } from '@/utils/errors';
import { money, duration, formatDate, formatPhone, time, toDatetimeLocalInput, toMinor, currencySymbol } from '@/utils/format';

const STATUS_TONE: Record<OrderStatus, Tone> = {
  pending: 'accent',
  confirmed: 'brand',
  in_progress: 'brand',
  ready: 'ok',
  out_for_delivery: 'ok',
  completed: 'neutral',
  cancelled: 'danger',
};

export function StatusBadge({ order }: { order: Order }) {
  const { org } = useOrg();
  return <Badge tone={STATUS_TONE[order.status]}>{statusLabel(order.status, order, org.businessType)}</Badge>;
}

export function PayBadge({ order }: { order: Order }) {
  switch (order.paymentState) {
    case 'paid':
      return <Badge tone="ok">Paid</Badge>;
    case 'submitted':
      return <Badge tone="accent">MoMo to check</Badge>;
    case 'partial':
      return <Badge tone="accent">Part paid</Badge>;
    case 'refunded':
      return <Badge>Refunded</Badge>;
    default:
      return <Badge>Not paid</Badge>;
  }
}

export const itemsText = (o: Order) => o.lines.map((l) => `${l.quantity}× ${l.name}`).join(', ');

/** The one-tap "next step" button. Asks for a rider before sending out. */
export function NextStepButton({ order, size = 'sm' }: { order: WithId<Order>; size?: 'sm' | 'md' }) {
  const { org } = useOrg();
  const canManage = usePermission('orders.manage');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const next = nextStatus(order);
  if (!next || !canManage || next === 'out_for_delivery') return null;
  const go = async () => {
    setBusy(true);
    try {
      await updateOrderStatus(order.id, next);
      toast.success(`#${order.number}: ${statusLabel(next, order, org.businessType)}. The customer got a WhatsApp update.`);
    } catch (e) {
      toast.error(toMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size={size} variant="ok" loading={busy} onClick={(e) => { e.stopPropagation(); void go(); }}>
      {actionLabel(next, order, org.businessType)}
    </Button>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h3 className="font-semibold">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function OrderDrawer({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { org } = useOrg();
  const ref = useMemo(() => (orderId ? orderRef(org.id, orderId) : null), [org.id, orderId]);
  const state = useDocument(ref);
  const order = state.status === 'ready' ? state.data : null;
  return (
    <Drawer open={Boolean(orderId)} title={order ? `${order.hasProducts ? 'Order' : 'Booking'} #${order.number}` : 'Order'} onClose={onClose}>
      {order ? <OrderDetail order={order} /> : <p className="text-muted">Loading…</p>}
    </Drawer>
  );
}

function OrderDetail({ order }: { order: WithId<Order> }) {
  const { org } = useOrg();
  const toast = useToast();
  const canManage = usePermission('orders.manage');
  const canCancel = usePermission('orders.cancel');
  const canPay = usePermission('payments.verify');
  const next = nextStatus(order);
  const [rider, setRider] = useState({ name: order.rider?.name ?? '', phone: order.rider?.phone ?? '' });
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('Customer asked to cancel');
  const [busy, setBusy] = useState<string | null>(null);
  const [when, setWhen] = useState(toDatetimeLocalInput(order.appointmentAt));
  const [pay, setPay] = useState({ open: false, method: 'cash' as 'cash' | 'momo', amount: ((order.totalMinor - order.paidMinor) / 100).toFixed(2), reference: '' });
  const [note, setNote] = useState(order.note ?? '');

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error(toMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  };
  const due = Math.max(0, order.totalMinor - order.paidMinor);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge order={order} />
        <PayBadge order={order} />
        <span className="text-sm text-muted">{formatDate(order.createdAt)}</span>
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{order.customerName}</p>
          <p className="tabular text-sm text-muted">{formatPhone(order.customerPhone)}</p>
        </div>
        <Link to={`/chats/${order.customerId}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line2 px-3 text-[13px] font-semibold hover:bg-raised">
          <Icon name="chat" className="h-4 w-4" /> Chat
        </Link>
      </div>

      <Section title="Items">
        <table className="w-full text-sm">
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.itemId}>
                <td className="py-1">
                  {l.quantity}× {l.name}
                  {l.durationMinutes ? <span className="text-muted"> · {duration(l.durationMinutes)}</span> : null}
                </td>
                <td className="tabular py-1 text-right">{money(l.unitPriceMinor * l.quantity)}</td>
              </tr>
            ))}
            {order.deliveryFeeMinor > 0 && (
              <tr>
                <td className="py-1 text-muted">Delivery</td>
                <td className="tabular py-1 text-right">{money(order.deliveryFeeMinor)}</td>
              </tr>
            )}
            <tr className="border-t border-line font-bold">
              <td className="pt-2">Total</td>
              <td className="tabular pt-2 text-right">{money(order.totalMinor)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-sm">
          <Icon name={order.fulfilment === 'delivery' ? 'truck' : 'info'} className="mr-1 inline h-4 w-4 align-[-3px]" />
          {FULFILMENT_LABEL[order.fulfilment]}
          {order.deliveryAddress ? `: ${order.deliveryAddress}` : ''}
          {order.rider ? ` · ${order.rider.name} (${order.rider.phone})` : ''}
        </p>
      </Section>

      {(order.hasServices || order.appointmentAt) && (
        <Section title="Booking time">
          {order.appointmentRequest && <p className="mb-2 text-sm">Customer asked for: <b>“{order.appointmentRequest}”</b></p>}
          {canManage && isOpen(order.status) ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1">
                <Input type="datetime-local" label="Confirmed time" value={when} onChange={(e) => setWhen(e.target.value)} />
              </div>
              <Button variant="secondary" disabled={!when} loading={busy === 'when'} onClick={() => void run('when', () => setAppointment(order.id, new Date(when)), 'Time saved.')}>
                Save time
              </Button>
            </div>
          ) : (
            <p className="text-sm">{order.appointmentAt ? formatDate(order.appointmentAt) : 'No time set'}</p>
          )}
        </Section>
      )}

      <Section
        title="Payment"
        action={canPay && due > 0 && order.status !== 'cancelled' && !pay.open ? <Button size="sm" variant="secondary" onClick={() => setPay({ ...pay, open: true })}>Record payment</Button> : undefined}
      >
        <p className="text-sm">
          Paid <b className="tabular">{money(order.paidMinor)}</b> of <span className="tabular">{money(order.totalMinor)}</span>
          {due > 0 && <span className="text-muted"> · {money(due)} due</span>}
        </p>
        {order.paymentState === 'submitted' && (
          <Link to="/payments" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-ink underline">
            A MoMo payment is waiting for your check <Icon name="arrow" className="h-4 w-4" />
          </Link>
        )}
        {pay.open && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Select label="How" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value as 'cash' | 'momo' })}>
              <option value="cash">Cash</option>
              <option value="momo">MoMo (I saw the SMS)</option>
            </Select>
            <Input label={`Amount (${currencySymbol()})`} inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            {pay.method === 'momo' && <Input label="Transaction ID" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />}
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button
                variant="ok"
                loading={busy === 'pay'}
                onClick={async () => {
                  const amountMinor = toMinor(pay.amount);
                  if (!amountMinor) return toast.error('Enter the amount.');
                  const ok = await run('pay', () => recordPayment({ orderId: order.id, method: pay.method, network: null, reference: pay.reference || null, amountMinor }), 'Payment recorded.');
                  if (ok) setPay({ ...pay, open: false });
                }}
              >
                Save payment
              </Button>
              <Button variant="ghost" onClick={() => setPay({ ...pay, open: false })}>Cancel</Button>
            </div>
          </div>
        )}
      </Section>

      {canManage && next && (
        <Section title="Next step">
          {next === 'out_for_delivery' && (
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <Input label="Rider name" value={rider.name} onChange={(e) => setRider({ ...rider, name: e.target.value })} />
              <Input label="Rider phone" inputMode="tel" value={rider.phone} onChange={(e) => setRider({ ...rider, phone: e.target.value })} />
            </div>
          )}
          {order.status === 'pending' && order.paymentState !== 'paid' && (
            <p className="mb-3 text-sm text-muted">Not paid yet. Confirm now only if they'll pay on delivery or in person.</p>
          )}
          <Button
            variant="ok"
            loading={busy === 'next'}
            onClick={() =>
              void run(
                'next',
                () => updateOrderStatus(order.id, next, next === 'out_for_delivery' && rider.name ? { rider } : {}),
                `${statusLabel(next, order, org.businessType)}. The customer got a WhatsApp update.`,
              )
            }
            disabled={next === 'out_for_delivery' && (!rider.name || rider.phone.length < 6)}
          >
            {actionLabel(next, order, org.businessType)}
          </Button>
        </Section>
      )}

      <Section title="Timeline">
        <ol className="space-y-1.5 text-sm">
          {order.statusHistory.map((h, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-ok" />
                {h.status === 'pending' ? 'Placed' : statusLabel(h.status, order, org.businessType)}
                {h.reason ? <span className="text-muted"> · {h.reason}</span> : null}
              </span>
              <span className="tabular text-muted">{time(h.at)}</span>
            </li>
          ))}
        </ol>
      </Section>

      {canManage && (
        <Section title="Note for your team">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only your team sees this" />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="secondary" loading={busy === 'note'} onClick={() => void run('note', () => setOrderNote(org.id, order.id, note), 'Note saved.')}>
              Save note
            </Button>
          </div>
        </Section>
      )}

      {canCancel && isOpen(order.status) && (
        <div className="mt-4">
          {cancelling ? (
            <div className="rounded-2xl border border-danger/40 bg-surface p-4">
              <Select label="Why cancel?" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option>Customer asked to cancel</option>
                <option>Out of stock</option>
                <option>No payment</option>
                <option>We can't do that time</option>
                <option>We're closed</option>
              </Select>
              <p className="mt-2 text-sm text-muted">Stock goes back and the customer gets a WhatsApp message.</p>
              <div className="mt-3 flex gap-2">
                <Button variant="danger" loading={busy === 'cancel'} onClick={() => void run('cancel', () => updateOrderStatus(order.id, 'cancelled', { reason }), 'Cancelled. Stock returned.').then((ok) => ok && setCancelling(false))}>
                  Cancel it
                </Button>
                <Button variant="ghost" onClick={() => setCancelling(false)}>Keep it</Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setCancelling(true)}>Cancel {order.hasProducts ? 'order' : 'booking'}</Button>
          )}
        </div>
      )}
    </div>
  );
}
