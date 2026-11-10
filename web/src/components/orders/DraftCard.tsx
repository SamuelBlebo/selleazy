import { useState } from 'react';
import { Button, Icon, Input, Select } from '@/components/ui';
import { FULFILMENT_LABEL, fulfilmentOptions } from '@/config/business';
import { useLive } from '@/context/LiveContext';
import { useOrg } from '@/hooks/usePermission';
import { useToast } from '@/hooks/useToast';
import { acceptDraftOrder, dismissDraftOrder } from '@/services';
import type { DraftOrder, Fulfilment, WithId } from '@/types';
import { toMessage } from '@/utils/errors';
import { cedis, time, toDatetimeLocalInput } from '@/utils/format';

/**
 * A typed order SellEazy read from chat (ShopFlow's "draft, human confirms").
 * Nothing is created until a person checks the items and taps Create.
 */
export function DraftCard({ draft }: { draft: WithId<DraftOrder> }) {
  const { org } = useOrg();
  const live = useLive();
  const toast = useToast();
  const [lines, setLines] = useState(draft.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })));
  const [addId, setAddId] = useState('');
  const hasProducts = lines.some((l) => live.items.find((i) => i.id === l.itemId)?.kind !== 'service');
  const options = fulfilmentOptions(org.features, hasProducts);
  const [fulfilment, setFulfilment] = useState<Fulfilment>(draft.fulfilment && options.includes(draft.fulfilment) ? draft.fulfilment : options[0]);
  const [address, setAddress] = useState(draft.address ?? '');
  const [when, setWhen] = useState(toDatetimeLocalInput(draft.appointmentAt));
  const [busy, setBusy] = useState<'ok' | 'no' | null>(null);

  const item = (id: string) => live.items.find((i) => i.id === id);
  const fee = fulfilment === 'delivery' ? org.deliveryFeeMinor : 0;
  const total = lines.reduce((s, l) => s + (item(l.itemId)?.priceMinor ?? 0) * l.quantity, 0) + fee;
  const hasService = lines.some((l) => item(l.itemId)?.kind === 'service');
  const setQty = (i: number, d: number) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, quantity: Math.max(0, Math.min(99, l.quantity + d)) } : l)).filter((l) => l.quantity > 0));

  if (draft.status !== 'open') {
    return (
      <div className="mx-auto my-2 w-full max-w-[560px] rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-muted">
        {draft.status === 'accepted' ? `Confirmed as ${draft.lines.every((l) => l.kind === 'service') ? 'booking' : 'order'} #${draft.orderNumber}.` : 'Marked as not an order.'}
      </div>
    );
  }

  const accept = async () => {
    if (!lines.length) return toast.error('Add at least one item.');
    if ((fulfilment === 'delivery' || fulfilment === 'on_site') && address.trim().length < 4) return toast.error('Add the address.');
    setBusy('ok');
    try {
      const r = await acceptDraftOrder({ draftId: draft.id, lines, fulfilment, address: address || null, appointmentAt: when ? new Date(when).toISOString() : null });
      toast.success(`Order #${r.number} created. Stock set aside.`);
    } catch (e) {
      toast.error(toMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto my-2.5 w-full max-w-[560px] overflow-hidden rounded-2xl border border-accent bg-surface shadow-card" role="group" aria-label="Order SellEazy read from the message">
      <div className="flex items-center justify-between gap-3 border-b-[3px] border-double border-accent-soft bg-[#FDF5E2] px-4 py-2 font-cap text-[11px] font-semibold uppercase tracking-[0.13em] text-accent-ink">
        <span className="flex items-center gap-2"><Icon name="spark" className="h-3.5 w-3.5" /> SellEazy read this as an order · only you see this</span>
        <span className="tabular">{time(draft.createdAt)}</span>
      </div>
      <div className="p-4">
        <blockquote className="mb-3 rounded-lg bg-raised px-3 py-2 italic">“{draft.text}”</blockquote>
        <div className="space-y-2">
          {lines.map((l, i) => {
            const it = item(l.itemId);
            return (
              <div key={l.itemId} className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
                <span>
                  {it?.name ?? 'Removed item'}
                  <span className="block text-xs text-muted">{it ? `${cedis(it.priceMinor)} each${it.kind === 'product' && it.trackStock ? ` · ${it.stock} in stock` : ''}` : ''}</span>
                </span>
                <span className="inline-flex items-center rounded-full border border-line2">
                  <button type="button" className="h-8 w-8 rounded-full text-lg font-bold hover:bg-raised" onClick={() => setQty(i, -1)} aria-label={`Fewer ${it?.name}`}>−</button>
                  <span className="tabular min-w-6 text-center font-semibold">{l.quantity}</span>
                  <button type="button" className="h-8 w-8 rounded-full text-lg font-bold hover:bg-raised" onClick={() => setQty(i, 1)} aria-label={`More ${it?.name}`}>+</button>
                </span>
                <span className="tabular w-24 text-right">{cedis((it?.priceMinor ?? 0) * l.quantity)}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <select value={addId} onChange={(e) => setAddId(e.target.value)} className="h-9 min-w-0 flex-1 rounded-full border border-line2 bg-white px-3 text-sm" aria-label="Add an item">
            <option value="">Add something SellEazy missed…</option>
            {live.items.filter((i) => i.active && !lines.some((l) => l.itemId === i.id)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <Button size="sm" variant="secondary" disabled={!addId} onClick={() => { setLines([...lines, { itemId: addId, quantity: 1 }]); setAddId(''); }}>Add</Button>
        </div>
        {draft.unmatched.length > 0 && <p className="mt-2 text-xs text-muted">Words SellEazy didn't recognise: {draft.unmatched.join(', ')}</p>}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Select label="How" value={fulfilment} onChange={(e) => setFulfilment(e.target.value as Fulfilment)}>
            {options.map((f) => <option key={f} value={f}>{FULFILMENT_LABEL[f]}</option>)}
          </Select>
          {(fulfilment === 'delivery' || fulfilment === 'on_site') && <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />}
          {hasService && (
            <Input type="datetime-local" label={draft.appointmentRequest ? `Time (asked: “${draft.appointmentRequest}”)` : 'Time'} value={when} onChange={(e) => setWhen(e.target.value)} />
          )}
        </div>
        <div className="mt-3 flex justify-between border-t border-line pt-3 font-bold">
          <span>Total{fee ? ' incl. delivery' : ''}</span>
          <span className="tabular">{cedis(total)}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="ok" loading={busy === 'ok'} onClick={() => void accept()}>
            <Icon name="check" /> Create order &amp; send MoMo details
          </Button>
          <Button
            variant="ghost"
            loading={busy === 'no'}
            onClick={async () => {
              setBusy('no');
              try {
                await dismissDraftOrder(draft.id);
              } catch (e) {
                toast.error(toMessage(e));
              } finally {
                setBusy(null);
              }
            }}
          >
            Not an order
          </Button>
        </div>
      </div>
    </div>
  );
}
