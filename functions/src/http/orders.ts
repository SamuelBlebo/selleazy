import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import type { CatalogItem, OrderStatus } from '../domain/model';
import { can } from '../domain/permissions';
import { placeOrder, transitionOrder } from '../services/orders';
import { createPayLink, paymentSettingsOf } from '../services/payLinks';
import { formatMoney, type Currency } from '../domain/money';
import { PAYSTACK_SECRET_KEY } from '../config';
import { customerRef, db, draftOrdersRef, itemsRef, loadCredentialsForOrg, ordersRef, orgRef, stockMovementsRef, toWaId } from '../tenant';
import { Outbox } from '../whatsapp/client';
import { howToPay, linesSummary } from '../whatsapp/copy';
import { parse, requireMember } from './guards';

const STATUSES = ['pending', 'confirmed', 'in_progress', 'ready', 'out_for_delivery', 'completed', 'cancelled'] as const;
const FULFILMENTS = ['delivery', 'pickup', 'dine_in', 'appointment', 'on_site'] as const;

const placeErrors = (r: Exclude<Awaited<ReturnType<typeof placeOrder>>, { ok: true }>) =>
  r.reason === 'out_of_stock' ? `Only ${r.available} ${r.itemName} left.` : r.reason === 'unavailable' ? `${r.itemName} is not available.` : 'Add at least one item.';

/** Every status change from the dashboard and the kitchen screen. */
export const updateOrderStatus = onCall(async (request) => {
  const input = parse(
    z.object({
      orderId: z.string().min(1),
      status: z.enum(STATUSES),
      reason: z.string().trim().max(200).optional(),
      rider: z.object({ name: z.string().trim().min(1).max(60), phone: z.string().trim().min(6).max(20) }).optional(),
    }),
    request.data,
  );
  const ctx = await requireMember(request.auth, input.status === 'cancelled' ? 'orders.cancel' : undefined);
  // Kitchen staff may only move orders through preparation.
  const kitchenMoves: OrderStatus[] = ['in_progress', 'ready'];
  if (!can(ctx.role, 'orders.manage') && !(can(ctx.role, 'kitchen.manage') && kitchenMoves.includes(input.status))) {
    throw new HttpsError('permission-denied', 'Your role cannot change this order.');
  }
  return transitionOrder(ctx.orgId, input.orderId, input.status, { by: ctx.uid, reason: input.reason ?? null, rider: input.rider ?? null });
});

/** Confirms or changes a booking's time. */
export const setAppointment = onCall(async (request) => {
  const { orgId, uid } = await requireMember(request.auth, 'orders.manage');
  const { orderId, at } = parse(z.object({ orderId: z.string().min(1), at: z.string().datetime() }), request.data, 'Pick a date and time.');
  await ordersRef(orgId).doc(orderId).update({ appointmentAt: Timestamp.fromDate(new Date(at)), updatedAt: FieldValue.serverTimestamp(), appointmentSetBy: uid });
  return { ok: true as const };
});

/** Orders taken by phone or in person. */
export const createManualOrder = onCall({ secrets: [PAYSTACK_SECRET_KEY] }, async (request) => {
  const { orgId, uid } = await requireMember(request.auth, 'orders.manage');
  const input = parse(
    z.object({
      customerName: z.string().trim().min(1).max(80),
      customerPhone: z.string().trim().min(9).max(20),
      lines: z.array(z.object({ itemId: z.string().min(1), quantity: z.number().int().min(1).max(99) })).min(1).max(50),
      fulfilment: z.enum(FULFILMENTS),
      address: z.string().trim().max(300).optional().nullable(),
      appointmentAt: z.string().datetime().optional().nullable(),
      note: z.string().trim().max(500).optional().nullable(),
    }),
    request.data,
  );
  const waId = toWaId(input.customerPhone);
  const result = await placeOrder({
    orgId,
    customer: { waId, name: input.customerName, phone: `+${waId}` },
    lines: input.lines,
    fulfilment: input.fulfilment,
    address: input.address ?? null,
    appointment: input.appointmentAt ? { requested: null, at: new Date(input.appointmentAt) } : null,
    channel: 'manual',
    note: input.note ?? null,
    by: uid,
  });
  if (!result.ok) throw new HttpsError('failed-precondition', placeErrors(result));

  // With payment links on, send the link if WhatsApp still allows a free-form message; staff get it either way.
  const link = await createPayLink(orgId, result.orderId);
  let linkSent = false;
  if (link) {
    try {
      const [creds, org, cust] = await Promise.all([loadCredentialsForOrg(orgId), orgRef(orgId).get(), customerRef(orgId, waId).get()]);
      const lastInbound = (cust.get('lastInboundAt') as Timestamp | undefined)?.toMillis() ?? null;
      if (creds && lastInbound && Date.now() - lastInbound < 23.5 * 60 * 60000) {
        const currency = (org.get('currency') as Currency) ?? 'GHS';
        const sent = await new Outbox(creds, orgId, waId, 'bot').text(
          [`Order #${result.number}: ${formatMoney(result.totalMinor, currency)}`, '', howToPay(result.totalMinor, org.get('momo'), link, paymentSettingsOf(org).mode, currency)].join('\n'),
        );
        linkSent = sent.ok;
      }
    } catch {
      // Staff still get the link below and can share it themselves.
    }
  }
  return { orderId: result.orderId, number: result.number, payUrl: link?.url ?? null, linkSent };
});

/** Turns a typed-order draft into a real order, after a human corrected it. */
export const acceptDraftOrder = onCall({ secrets: [PAYSTACK_SECRET_KEY] }, async (request) => {
  const { orgId, uid } = await requireMember(request.auth, 'orders.manage');
  const input = parse(
    z.object({
      draftId: z.string().min(1),
      lines: z.array(z.object({ itemId: z.string().min(1), quantity: z.number().int().min(1).max(99) })).min(1).max(50),
      fulfilment: z.enum(FULFILMENTS),
      address: z.string().trim().max(300).optional().nullable(),
      appointmentAt: z.string().datetime().optional().nullable(),
    }),
    request.data,
  );
  const draft = await draftOrdersRef(orgId).doc(input.draftId).get();
  if (!draft.exists || draft.get('status') !== 'open') throw new HttpsError('failed-precondition', 'This draft was already handled.');
  const waId = draft.get('customerId') as string;
  const result = await placeOrder({
    orgId,
    customer: { waId, name: (draft.get('customerName') as string) || 'Customer', phone: `+${waId}` },
    lines: input.lines,
    fulfilment: input.fulfilment,
    address: input.address ?? null,
    appointment:
      input.appointmentAt || draft.get('appointmentRequest')
        ? { requested: (draft.get('appointmentRequest') as string) ?? null, at: input.appointmentAt ? new Date(input.appointmentAt) : null }
        : null,
    channel: 'whatsapp_text',
    note: null,
    by: uid,
    draftId: input.draftId,
  });
  if (!result.ok) throw new HttpsError('failed-precondition', placeErrors(result));

  // Tell the customer what was confirmed and how to pay. Best-effort: the order stands either way.
  try {
    const [creds, org, link] = await Promise.all([loadCredentialsForOrg(orgId), orgRef(orgId).get(), createPayLink(orgId, result.orderId)]);
    const currency = (org.get('currency') as Currency) ?? 'GHS';
    if (creds) {
      await new Outbox(creds, orgId, waId, 'bot').text(
        [
          `Order #${result.number} confirmed:`,
          linesSummary(result.lines, currency),
          `Total: ${formatMoney(result.totalMinor, currency)}`,
          '',
          howToPay(result.totalMinor, org.get('momo'), link, paymentSettingsOf(org).mode, currency),
        ].join('\n'),
      );
    }
  } catch {
    // The merchant still sees the order; they can message the customer from the Inbox.
  }
  return { orderId: result.orderId, number: result.number, totalMinor: result.totalMinor };
});

export const dismissDraftOrder = onCall(async (request) => {
  const { orgId, uid } = await requireMember(request.auth, 'orders.manage');
  const { draftId } = parse(z.object({ draftId: z.string().min(1) }), request.data);
  await draftOrdersRef(orgId).doc(draftId).update({ status: 'dismissed', resolvedBy: uid, resolvedAt: FieldValue.serverTimestamp() });
  return { ok: true as const };
});

/** Restock, wastage, returns and stock counts. The only way stock changes outside an order. */
export const adjustStock = onCall(async (request) => {
  const { orgId, uid } = await requireMember(request.auth, 'stock.write');
  const input = parse(
    z.object({
      itemId: z.string().min(1),
      reason: z.enum(['restock', 'wastage', 'correction', 'return']),
      quantity: z.number().int().min(0).max(100000),
      note: z.string().trim().max(200).optional(),
    }),
    request.data,
    'Enter a quantity.',
  );
  return db().runTransaction(async (tx) => {
    const ref = itemsRef(orgId).doc(input.itemId);
    const snap = await tx.get(ref);
    const item = snap.data() as CatalogItem | undefined;
    if (!item || item.kind !== 'product') throw new HttpsError('not-found', 'That product does not exist.');
    const change = input.reason === 'correction' ? input.quantity - item.stock : input.reason === 'wastage' ? -input.quantity : input.quantity;
    const balanceAfter = Math.max(0, item.stock + change);
    const now = Timestamp.now();
    tx.update(ref, { stock: balanceAfter, updatedAt: now });
    tx.set(stockMovementsRef(orgId).doc(), {
      itemId: ref.id, itemName: item.name, change: balanceAfter - item.stock, balanceAfter, reason: input.reason,
      orderId: null, orderNumber: null, note: input.note ?? null, by: uid, at: now,
    });
    return { stock: balanceAfter };
  });
});
