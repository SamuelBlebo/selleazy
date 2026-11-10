import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { currentPeriodKey } from '../billing/plans';
import type { CatalogItem, Fulfilment, OrderChannel, OrderLine, OrderStatus } from '../domain/model';
import { canTransition, STATUS_TIMESTAMP } from '../domain/orderFlow';
import { customerRef, db, draftOrdersRef, itemsRef, ordersRef, orgRef, stockMovementsRef } from '../tenant';

export interface PlaceOrderInput {
  orgId: string;
  customer: { waId: string; name: string; phone: string };
  lines: Array<{ itemId: string; quantity: number }>;
  fulfilment: Fulfilment;
  address: string | null;
  /** What the customer asked for, in their words ("Saturday 10am"), and SellEazy's best reading of it. */
  appointment: { requested: string | null; at: Date | null } | null;
  channel: OrderChannel;
  note: string | null;
  /** A staff uid, or "bot". */
  by: string;
  /** Set when this order comes from accepting a typed-order draft. */
  draftId?: string;
}

export type PlaceOrderResult =
  | { ok: true; orderId: string; number: number; totalMinor: number; lines: OrderLine[] }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'unavailable'; itemName: string }
  | { ok: false; reason: 'out_of_stock'; itemName: string; available: number };

/**
 * Creates an order in one transaction: order number, line prices read from
 * the catalog (never trusted from the caller), stock set aside for tracked
 * products with a movement row each, plan usage, and the customer record.
 * Stock is re-read inside the transaction so two customers racing for the
 * last item cannot both win.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const wanted = new Map<string, number>();
  for (const line of input.lines) {
    if (line.quantity < 1) continue;
    wanted.set(line.itemId, (wanted.get(line.itemId) ?? 0) + Math.min(99, Math.floor(line.quantity)));
  }
  if (wanted.size === 0) return { ok: false, reason: 'empty' };

  const { orgId } = input;
  return db().runTransaction(async (tx): Promise<PlaceOrderResult> => {
    const orgSnap = await tx.get(orgRef(orgId));
    const itemRefs = [...wanted.keys()].map((id) => itemsRef(orgId).doc(id));
    const itemSnaps = await tx.getAll(...itemRefs);
    const custRef = customerRef(orgId, input.customer.waId);
    const custSnap = await tx.get(custRef);

    const lines: OrderLine[] = [];
    for (const snap of itemSnaps) {
      const item = snap.data() as CatalogItem | undefined;
      const quantity = wanted.get(snap.id) ?? 0;
      if (!item || !item.active) return { ok: false, reason: 'unavailable', itemName: item?.name ?? 'That item' };
      if (item.kind === 'product' && item.trackStock && quantity > item.stock) {
        return { ok: false, reason: 'out_of_stock', itemName: item.name, available: Math.max(0, item.stock) };
      }
      lines.push({
        itemId: snap.id,
        kind: item.kind,
        name: item.name,
        unitPriceMinor: item.priceMinor,
        quantity,
        durationMinutes: item.kind === 'service' ? item.durationMinutes ?? null : null,
      });
    }

    const now = Timestamp.now();
    const subtotalMinor = lines.reduce((sum, l) => sum + l.unitPriceMinor * l.quantity, 0);
    const deliveryFeeMinor = input.fulfilment === 'delivery' ? ((orgSnap.get('deliveryFeeMinor') as number) ?? 0) : 0;
    const totalMinor = subtotalMinor + deliveryFeeMinor;
    const number = ((orgSnap.get('orderCounter') as number) ?? 0) + 1;
    const periodKey = currentPeriodKey();
    const usedBefore =
      orgSnap.get('subscription.currentPeriodStart') === periodKey ? ((orgSnap.get('subscription.ordersUsedThisPeriod') as number) ?? 0) : 0;

    const order = ordersRef(orgId).doc();
    tx.set(order, {
      number,
      status: 'pending' satisfies OrderStatus,
      paymentState: 'unpaid',
      paidMinor: 0,
      fulfilment: input.fulfilment,
      channel: input.channel,
      customerId: input.customer.waId,
      customerName: input.customer.name,
      customerPhone: input.customer.phone,
      deliveryAddress: input.address,
      appointmentRequest: input.appointment?.requested ?? null,
      appointmentAt: input.appointment?.at ? Timestamp.fromDate(input.appointment.at) : null,
      lines,
      hasProducts: lines.some((l) => l.kind === 'product'),
      hasServices: lines.some((l) => l.kind === 'service'),
      subtotalMinor,
      deliveryFeeMinor,
      totalMinor,
      currency: 'GHS',
      note: input.note,
      cancelReason: null,
      rider: null,
      statusHistory: [{ status: 'pending', at: now, by: input.by }],
      createdBy: input.by,
      createdAt: now,
      updatedAt: now,
    });

    itemSnaps.forEach((snap) => {
      const item = snap.data() as CatalogItem;
      if (item.kind !== 'product' || !item.trackStock) return;
      const quantity = wanted.get(snap.id) ?? 0;
      const balanceAfter = item.stock - quantity;
      tx.update(snap.ref, { stock: balanceAfter, updatedAt: now });
      tx.set(stockMovementsRef(orgId).doc(), {
        itemId: snap.id,
        itemName: item.name,
        change: -quantity,
        balanceAfter,
        reason: 'sale',
        orderId: order.id,
        orderNumber: number,
        note: `Set aside for order #${number}`,
        by: input.by,
        at: now,
      });
    });

    tx.update(orgRef(orgId), {
      orderCounter: number,
      'subscription.currentPeriodStart': periodKey,
      'subscription.ordersUsedThisPeriod': usedBefore + 1,
    });

    tx.set(
      custRef,
      {
        name: input.customer.name,
        phone: input.customer.phone,
        ...(input.address ? { address: input.address } : {}),
        orderCount: ((custSnap.get('orderCount') as number) ?? 0) + 1,
        lastOrderAt: now,
        updatedAt: now,
        ...(custSnap.exists
          ? {}
          : { totalSpentMinor: 0, note: null, unreadCount: 0, lastMessageAt: null, needsHuman: false, tags: [], createdAt: now }),
      },
      { merge: true },
    );

    if (input.draftId) {
      tx.update(draftOrdersRef(orgId).doc(input.draftId), { status: 'accepted', orderId: order.id, orderNumber: number, resolvedBy: input.by, resolvedAt: now });
    }

    return { ok: true, orderId: order.id, number, totalMinor, lines };
  });
}

export interface TransitionOptions {
  by: string;
  reason?: string | null;
  rider?: { name: string; phone: string } | null;
}

/**
 * Moves an order to `to` if the state machine allows it. Cancelling gives
 * tracked stock back with a movement row per product. The customer's
 * WhatsApp update is sent by triggers/onOrderStatusChange, not here.
 */
export async function transitionOrder(orgId: string, orderId: string, to: OrderStatus, opts: TransitionOptions) {
  const ref = ordersRef(orgId).doc(orderId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'That order does not exist.');
    const from = snap.get('status') as OrderStatus;
    if (from === to) throw new HttpsError('failed-precondition', 'The order is already in that state.');
    if (!canTransition(from, to)) {
      throw new HttpsError('failed-precondition', `A ${from.replace(/_/g, ' ')} order cannot become ${to.replace(/_/g, ' ')}.`);
    }

    const lines = (snap.get('lines') as OrderLine[]) ?? [];
    const releasable = to === 'cancelled' ? lines.filter((l) => l.kind === 'product') : [];
    const itemSnaps = releasable.length ? await tx.getAll(...releasable.map((l) => itemsRef(orgId).doc(l.itemId))) : [];

    const now = Timestamp.now();
    const patch: Record<string, unknown> = {
      status: to,
      updatedAt: now,
      statusHistory: FieldValue.arrayUnion({ status: to, at: now, by: opts.by, reason: opts.reason ?? null }),
    };
    const stamp = STATUS_TIMESTAMP[to];
    if (stamp) patch[stamp] = now;
    if (to === 'cancelled') patch.cancelReason = opts.reason ?? null;
    if (opts.rider) patch.rider = opts.rider;
    tx.update(ref, patch);

    itemSnaps.forEach((itemSnap, i) => {
      const item = itemSnap.data() as CatalogItem | undefined;
      if (!item || !item.trackStock) return;
      const line = releasable[i];
      const balanceAfter = item.stock + line.quantity;
      tx.update(itemSnap.ref, { stock: balanceAfter, updatedAt: now });
      tx.set(stockMovementsRef(orgId).doc(), {
        itemId: itemSnap.id,
        itemName: item.name,
        change: line.quantity,
        balanceAfter,
        reason: 'cancellation',
        orderId,
        orderNumber: snap.get('number'),
        note: `Returned from cancelled order #${snap.get('number')}`,
        by: opts.by,
        at: now,
      });
    });

    return { from, to, number: snap.get('number') as number };
  });
}
