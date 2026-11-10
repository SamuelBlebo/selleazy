import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { limit, orderBy, query, where } from 'firebase/firestore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Drawer, EmptyState, Icon, Input, SearchInput, Segmented, Select, Switch, Textarea } from '@/components/ui';
import { MOVEMENT_LABEL } from '@/config/business';
import { planById } from '@/config/plans';
import { useLive } from '@/context/LiveContext';
import { stockMovementsRef } from '@/firebase';
import { useCollection } from '@/hooks/useCollection';
import { useOrg, usePermission } from '@/hooks/usePermission';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/useToast';
import { adjustStock, createItem, deleteItem, setItemActive, updateItem, type ItemInput } from '@/services';
import type { CatalogItem, ItemKind, WithId } from '@/types';
import { toMessage } from '@/utils/errors';
import { cedis, shortWhen, toMinor } from '@/utils/format';

export function CatalogPage() {
  const { org, words } = useOrg();
  usePageTitle(words.catalog);
  const live = useLive();
  const canEdit = usePermission('catalog.write');
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<'all' | ItemKind>('all');
  const [q, setQ] = useState('');
  const editing = params.get('item');
  const creating = params.get('new') === '1';
  const close = () => setParams({}, { replace: true });

  const showKinds = org.businessType === 'mixed' || (live.items.some((i) => i.kind === 'service') && live.items.some((i) => i.kind === 'product'));
  const needle = q.trim().toLowerCase();
  const rows = live.items
    .filter((i) => kind === 'all' || i.kind === kind)
    .filter((i) => !needle || `${i.name} ${i.aliases.join(' ')} ${i.category}`.toLowerCase().includes(needle))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const plan = planById(org.subscription.plan);
  const atLimit = plan.itemLimit !== null && live.items.length >= plan.itemLimit;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <PageHeader
        title={words.catalog}
        description={`${live.items.length} ${live.items.length === 1 ? 'item' : 'items'}. What's switched on shows in your WhatsApp ${words.catalog.toLowerCase()}.`}
        actions={canEdit && (
          <Button onClick={() => (atLimit ? undefined : setParams({ new: '1' }))} disabled={atLimit} title={atLimit ? `Your plan allows ${plan.itemLimit} items` : undefined}>
            <Icon name="plus" /> Add {words.item}
          </Button>
        )}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {showKinds && <Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'product', label: 'Products' }, { value: 'service', label: 'Services' }]} />}
        <SearchInput value={q} onChange={setQ} placeholder={`Search ${words.catalog.toLowerCase()}`} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {rows.length === 0 ? (
          <EmptyState
            title={live.items.length ? 'Nothing matches' : `Add your first ${words.item}`}
            description={live.items.length ? 'Try another search.' : 'Customers see it in WhatsApp the moment you save it.'}
            action={canEdit && !live.items.length ? <Button onClick={() => setParams({ new: '1' })}><Icon name="plus" /> Add {words.item}</Button> : undefined}
          />
        ) : (
          rows.map((i) => (
            <div
              key={i.id}
              role={canEdit ? 'button' : undefined}
              tabIndex={canEdit ? 0 : undefined}
              onClick={() => canEdit && setParams({ item: i.id })}
              onKeyDown={(e) => canEdit && (e.key === 'Enter' || e.key === ' ') && setParams({ item: i.id })}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 first:border-t-0 hover:bg-[#FBF6EC] sm:grid-cols-[48px_minmax(0,2fr)_120px_110px_140px_60px]"
            >
              <span className="row-span-2 grid h-12 w-12 place-items-center overflow-hidden rounded-lg bg-raised text-muted sm:row-span-1">
                {i.imageUrl ? <img src={i.imageUrl} alt="" className="h-full w-full object-cover" /> : <Icon name={i.kind === 'service' ? 'scissors' : 'image'} />}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{i.name}</span>
                <span className="block truncate text-[13px] text-muted">{i.aliases.length ? `Also: ${i.aliases.join(', ')}` : i.category}</span>
              </span>
              <span className="hidden text-muted sm:block">{i.category}</span>
              <span className="tabular text-right font-semibold sm:font-normal">{cedis(i.priceMinor)}</span>
              <span className="col-start-2 sm:col-start-auto">
                {i.kind === 'service' ? (
                  <span className="text-sm text-muted">{i.durationMinutes ? `${i.durationMinutes} min` : 'Service'}{i.requiresBooking ? ' · booking' : ''}</span>
                ) : !i.trackStock ? (
                  <span className="text-sm text-muted">Not tracked</span>
                ) : i.stock === 0 ? (
                  <Badge tone="danger">Sold out</Badge>
                ) : i.stock <= i.lowStockAt ? (
                  <Badge tone="accent">Low · {i.stock} left</Badge>
                ) : (
                  <span className="tabular">{i.stock} in stock</span>
                )}
              </span>
              <span className="justify-self-end">
                <Switch checked={i.active} label={`Show ${i.name} to customers`} disabled={!canEdit} onChange={(v) => void setItemActive(org.id, i.id, v)} />
              </span>
            </div>
          ))
        )}
      </div>
      {live.items.some((i) => i.kind === 'product') && (
        <p className="mt-3 text-sm text-muted">Stock is set aside when a customer places an order, and goes back if the order is cancelled.</p>
      )}

      <ItemDrawer
        key={editing ?? (creating ? 'new' : 'none')}
        open={creating || Boolean(editing)}
        item={editing ? live.items.find((i) => i.id === editing) ?? null : null}
        onClose={close}
      />
    </div>
  );
}

function ItemDrawer({ open, item, onClose }: { open: boolean; item: WithId<CatalogItem> | null; onClose: () => void }) {
  const { org, words } = useOrg();
  const live = useLive();
  const toast = useToast();
  const canStock = usePermission('stock.write');
  const defaultKind: ItemKind = org.businessType === 'services' ? 'service' : 'product';
  const [f, setF] = useState({
    kind: item?.kind ?? defaultKind,
    name: item?.name ?? '',
    price: item ? (item.priceMinor / 100).toFixed(2) : '',
    category: item?.category ?? '',
    description: item?.description ?? '',
    aliases: item?.aliases.join(', ') ?? '',
    trackStock: item?.trackStock ?? true,
    stock: '',
    lowStockAt: String(item?.lowStockAt ?? 5),
    duration: item?.durationMinutes ? String(item.durationMinutes) : '',
    requiresBooking: item?.requiresBooking ?? true,
    active: item?.active ?? true,
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const [busy, setBusy] = useState(false);
  const categories = [...new Set(live.items.map((i) => i.category).filter(Boolean))];

  const save = async () => {
    const priceMinor = toMinor(f.price);
    if (f.name.trim().length < 2 || priceMinor === null) return toast.error('Add a name and a price.');
    const input: ItemInput = {
      kind: f.kind,
      name: f.name.trim(),
      description: f.description.trim(),
      category: f.category.trim() || 'Other',
      priceMinor,
      active: f.active,
      aliases: f.aliases.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20),
      sku: null,
      trackStock: f.kind === 'product' && f.trackStock,
      stock: f.kind === 'product' && f.trackStock ? Math.max(0, parseInt(f.stock, 10) || 0) : 0,
      lowStockAt: Math.max(0, parseInt(f.lowStockAt, 10) || 0),
      durationMinutes: f.kind === 'service' && f.duration ? Math.max(5, parseInt(f.duration, 10) || 0) : null,
      requiresBooking: f.kind === 'service' && f.requiresBooking,
    };
    setBusy(true);
    try {
      if (item) {
        const { stock: _s, kind: _k, ...rest } = input;
        void _s; void _k;
        await updateItem(org.id, item.id, rest, photo);
        toast.success('Saved.');
      } else {
        const { photoFailed } = await createItem(org.id, input, photo);
        if (photoFailed) toast.error(`${input.name} added, but the photo did not upload. Open the item and try the photo again.`);
        else toast.success(`${input.name} added. Customers can see it on WhatsApp now.`);
      }
      onClose();
    } catch (e) {
      toast.error(toMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!item || !window.confirm(`Delete ${item.name}? Past orders keep their record.`)) return;
    try {
      await deleteItem(org.id, item.id, item.imagePath);
      toast.success('Deleted.');
      onClose();
    } catch (e) {
      toast.error(toMessage(e));
    }
  };

  return (
    <Drawer
      open={open}
      title={item ? item.name : `Add ${words.item}`}
      onClose={onClose}
      footer={
        <>
          {item && <Button variant="danger" className="mr-auto" onClick={() => void remove()}>Delete</Button>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={() => void save()}>{item ? 'Save' : 'Add'}</Button>
        </>
      }
    >
      {!item && (
        <div className="mb-4">
          <Segmented value={f.kind} onChange={(kind) => setF({ ...f, kind })} options={[{ value: 'product', label: 'Product (has stock)' }, { value: 'service', label: 'Service (booked)' }]} />
        </div>
      )}
      <div className="space-y-3">
        <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={f.kind === 'service' ? 'e.g. Box braids' : 'e.g. Ankara dress'} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Price (GH₵)" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="45.00" />
          <div>
            <Input label="Category" list="cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="e.g. Dresses" />
            <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
        {f.kind === 'product' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {!item && <Input label="How many do you have?" inputMode="numeric" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} placeholder="20" disabled={!f.trackStock} />}
            <Input label="Warn me below" inputMode="numeric" value={f.lowStockAt} onChange={(e) => setF({ ...f, lowStockAt: e.target.value })} disabled={!f.trackStock} />
            <label className="flex items-center justify-between gap-3 sm:col-span-2">
              <span className="text-sm"><b>Track stock</b><span className="block text-muted">Turn off for made-to-order items.</span></span>
              <Switch checked={f.trackStock} label="Track stock" onChange={(v) => setF({ ...f, trackStock: v })} />
            </label>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="How long (minutes)" inputMode="numeric" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} placeholder="90" />
            <label className="flex items-center justify-between gap-3 self-end pb-2">
              <span className="text-sm font-semibold">Needs a booking time</span>
              <Switch checked={f.requiresBooking} label="Needs a booking time" onChange={(v) => setF({ ...f, requiresBooking: v })} />
            </label>
          </div>
        )}
        <Input label="Other names customers use" value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} placeholder="e.g. braids, knotless" hint="Helps SellEazy read typed orders like “2 braids abeg”." />
        <Textarea label="Description (optional)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Photo (optional)</span>
          {(preview ?? item?.imageUrl) && <img src={preview ?? item!.imageUrl!} alt="" className="mb-2 h-32 w-32 rounded-xl border border-line2 object-cover" />}
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-full file:border file:border-line2 file:bg-surface file:px-3 file:py-1.5 file:font-semibold" />
          <span className="mt-1 block text-xs text-muted">Customers see it on WhatsApp when they open your {words.catalog.toLowerCase()}. A photo from your phone is fine; SellEazy resizes it.</span>
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">Show to customers</span>
          <Switch checked={f.active} label="Show to customers" onChange={(v) => setF({ ...f, active: v })} />
        </label>
      </div>
      {item && item.kind === 'product' && item.trackStock && canStock && <StockPanel item={item} />}
    </Drawer>
  );
}

function StockPanel({ item }: { item: WithId<CatalogItem> }) {
  const { org } = useOrg();
  const toast = useToast();
  const [reason, setReason] = useState<'restock' | 'wastage' | 'correction' | 'return'>('restock');
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const history = useCollection(useMemo(() => query(stockMovementsRef(org.id), where('itemId', '==', item.id), orderBy('at', 'desc'), limit(30)), [org.id, item.id]));

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h3 className="font-semibold">Stock</h3>
        <span className="tabular">Now: <b>{item.stock}</b></span>
      </div>
      <div className="flex flex-wrap items-end gap-2 p-4">
        <div className="w-40"><Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
          <option value="restock">Restock</option>
          <option value="wastage">Wastage / damaged</option>
          <option value="return">Customer return</option>
          <option value="correction">Counted on shelf</option>
        </Select></div>
        <div className="w-28"><Input label={reason === 'correction' ? 'Actual count' : 'Quantity'} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
        <Button
          variant="secondary"
          loading={busy}
          onClick={async () => {
            const n = parseInt(qty, 10);
            if (!Number.isFinite(n) || n < 0) return toast.error('Enter a number.');
            setBusy(true);
            try {
              const r = await adjustStock(item.id, reason, n);
              toast.success(`${item.name}: now ${r.stock} in stock.`);
              setQty('');
            } catch (e) {
              toast.error(toMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Record
        </Button>
      </div>
      <div className="border-t border-line">
        {history.status === 'ready' && history.data.length === 0 && <p className="p-4 text-sm text-muted">No changes yet.</p>}
        {history.status === 'ready' &&
          history.data.map((m) => (
            <div key={m.id} className="grid grid-cols-[1fr_auto_auto] gap-3 border-t border-line px-4 py-2 text-sm first:border-t-0">
              <span>{MOVEMENT_LABEL[m.reason]}<span className="block text-xs text-muted">{m.note ?? ''}</span></span>
              <span className="tabular text-muted">{shortWhen(m.at)}</span>
              <b className={`tabular ${m.change < 0 ? 'text-danger' : 'text-ok-ink'}`}>{m.change > 0 ? '+' : ''}{m.change}</b>
            </div>
          ))}
      </div>
    </section>
  );
}
