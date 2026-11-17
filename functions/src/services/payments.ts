import { FieldValue, Timestamp, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { MomoNetwork, OrderStatus, PaymentMethod, PaymentState } from '../domain/model';
import { creditFromCharge, paystackPaymentId, settle, type PayLink } from '../payments/paystackLinks';
import { customerRef, db, ordersRef, paymentRefsRef, paymentsRef } from '../tenant';

/**
 * Manual MoMo verification (ShopFlow's payments.service, rebuilt on
 * Firestore). A customer replies with a Transaction ID; it lands here as a
 * "submitted" payment with any red flags attached; a human compares it with
 * the MoMo SMS and verifies or rejects. Verifying a payment that covers the
 * order also confirms a pending order.
 *
 * When MTN MoMo / Telecel Cash / AirtelTigo collection APIs are wired in
 * (payments/providers.ts), they call verifyPayment with by: "provider:mtn"
 * instead of a staff uid — nothing else here changes.
 */

export type PaymentFlag = 'amount_mismatch' | 'duplicate_reference' | 'amount_unknown';

export interface SubmitPaymentInput {
  orgId: string;
  orderId: string;
  method: PaymentMethod;
  network: MomoNetwork | null;
  reference: string | null;
  /** What the customer says they paid; null if they didn't say. */
  amountMinor: number | null;
  payerPhone: string | null;
  source: 'whatsapp' | 'staff';
  by: string;
}

const refKey = (network: MomoNetwork | null, reference: string) => `${network ?? 'any'}_${reference}`;

export async function submitPayment(input: SubmitPaymentInput) {
  const { orgId } = input;
  const orderDoc = ordersRef(orgId).doc(input.orderId);
  const payment = paymentsRef(orgId).doc();
  const refDoc = input.reference ? paymentRefsRef(orgId).doc(refKey(input.network, input.reference)) : null;

  return db().runTransaction(async (tx) => {
    const order = await tx.get(orderDoc);
    if (!order.exists) throw new HttpsError('not-found', 'That order does not exist.');
    const existingRef = refDoc ? await tx.get(refDoc) : null;

    const totalMinor = order.get('totalMinor') as number;
    const paidMinor = (order.get('paidMinor') as number) ?? 0;
    const dueMinor = Math.max(0, totalMinor - paidMinor);

    const flags: PaymentFlag[] = [];
    if (input.amountMinor === null) flags.push('amount_unknown');
    else if (input.amountMinor !== dueMinor) flags.push('amount_mismatch');
    if (existingRef?.exists) flags.push('duplicate_reference');

    const now = Timestamp.now();
    tx.set(payment, {
      orderId: input.orderId,
      orderNumber: order.get('number'),
      customerId: order.get('customerId'),
      customerName: order.get('customerName'),
      method: input.method,
      network: input.network,
      reference: input.reference,
      claimedMinor: input.amountMinor,
      expectedMinor: dueMinor,
      payerPhone: input.payerPhone,
      status: 'submitted',
      flags,
      duplicateOfOrderNumber: existingRef?.exists ? (existingRef.get('orderNumber') as number) : null,
      source: input.source,
      submittedBy: input.by,
      verifiedBy: null,
      verifiedAt: null,
      rejectedReason: null,
      createdAt: now,
      updatedAt: now,
    });
    if (refDoc && !existingRef?.exists) {
      tx.set(refDoc, { paymentId: payment.id, orderId: input.orderId, orderNumber: order.get('number'), createdAt: now });
    }
    if (order.get('paymentState') !== 'paid') {
      tx.update(orderDoc, { paymentState: 'submitted' satisfies PaymentState, updatedAt: now });
    }
    return { paymentId: payment.id, flags, dueMinor, orderNumber: order.get('number') as number };
  });
}

/**
 * Marks a payment verified, adds it to the order's paid amount, credits the
 * customer, and confirms a pending order once it is fully paid.
 */
export async function verifyPayment(orgId: string, paymentId: string, by: string) {
  const ref = paymentsRef(orgId).doc(paymentId);
  return db().runTransaction(async (tx) => {
    const payment = await tx.get(ref);
    if (!payment.exists) throw new HttpsError('not-found', 'That payment does not exist.');
    if (payment.get('status') !== 'submitted') throw new HttpsError('failed-precondition', 'This payment was already handled.');
    const orderDoc = ordersRef(orgId).doc(payment.get('orderId') as string);
    const order = await tx.get(orderDoc);
    if (!order.exists) throw new HttpsError('not-found', 'The order for this payment is gone.');

    const amount = (payment.get('claimedMinor') as number | null) ?? (payment.get('expectedMinor') as number);
    const now = Timestamp.now();
    tx.update(ref, { status: 'verified', verifiedBy: by, verifiedAt: now, amountMinor: amount, updatedAt: now });
    const s = applyToOrder(tx, orgId, order, amount, by, 'Payment verified', now);
    return { amountMinor: amount, ...s };
  });
}

/** Adds a verified amount to the order (and confirms a pending one once fully paid) and credits the customer. */
function applyToOrder(tx: Transaction, orgId: string, order: DocumentSnapshot, amount: number, by: string, reason: string, now: Timestamp) {
  const s = settle(
    { totalMinor: order.get('totalMinor') as number, paidMinor: (order.get('paidMinor') as number) ?? 0, status: order.get('status') as OrderStatus },
    amount,
  );
  const orderPatch: Record<string, unknown> = { paidMinor: s.paidMinor, paymentState: s.paymentState, updatedAt: now };
  if (s.confirms) {
    orderPatch.status = 'confirmed';
    orderPatch.confirmedAt = now;
    orderPatch.statusHistory = FieldValue.arrayUnion({ status: 'confirmed', at: now, by, reason });
  }
  tx.update(order.ref, orderPatch);
  tx.set(customerRef(orgId, order.get('customerId') as string), { totalSpentMinor: FieldValue.increment(amount), updatedAt: now }, { merge: true });
  return {
    fullyPaid: s.fullyPaid,
    confirmed: s.confirms,
    flags: s.flags,
    orderNumber: order.get('number') as number,
    customerId: order.get('customerId') as string,
    balanceMinor: s.balanceMinor,
  };
}

export interface ProviderPaymentInput {
  orgId: string;
  orderId: string;
  /** The provider's reference, e.g. the Paystack transaction reference. */
  reference: string;
  /** What the provider collected. */
  chargedMinor: number;
  method: PaymentMethod;
  network: MomoNetwork | null;
  payerPhone: string | null;
  /** e.g. "provider:paystack" */
  by: string;
}

/**
 * Records a payment a provider (Paystack) already confirmed. Created under a
 * fixed id per reference inside a transaction, so the same webhook twice
 * credits the order once. The fee the customer added on top is not credited.
 */
export async function recordProviderPayment(input: ProviderPaymentInput) {
  const { orgId } = input;
  const ref = paymentsRef(orgId).doc(paystackPaymentId(input.reference));
  const orderDoc = ordersRef(orgId).doc(input.orderId);
  return db().runTransaction(async (tx) => {
    const [existing, order] = await Promise.all([tx.get(ref), tx.get(orderDoc)]);
    if (existing.exists) return { duplicate: true as const };
    if (!order.exists) throw new Error(`Paid order ${input.orderId} not found in ${orgId}`);

    const amount = creditFromCharge(input.chargedMinor, input.reference, order.get('payLink') as PayLink | undefined);
    const dueMinor = Math.max(0, (order.get('totalMinor') as number) - ((order.get('paidMinor') as number) ?? 0));
    const now = Timestamp.now();
    const s = applyToOrder(tx, orgId, order, amount, input.by, 'Paid online', now);
    tx.set(ref, {
      orderId: input.orderId,
      orderNumber: order.get('number'),
      customerId: order.get('customerId'),
      customerName: order.get('customerName'),
      method: input.method,
      network: input.network,
      reference: input.reference,
      claimedMinor: amount,
      expectedMinor: dueMinor,
      amountMinor: amount,
      chargedMinor: input.chargedMinor,
      payerPhone: input.payerPhone,
      status: 'verified',
      flags: s.flags,
      duplicateOfOrderNumber: null,
      source: 'provider',
      submittedBy: input.by,
      verifiedBy: input.by,
      verifiedAt: now,
      rejectedReason: null,
      createdAt: now,
      updatedAt: now,
    });
    return { duplicate: false as const, amountMinor: amount, ...s };
  });
}

export async function rejectPayment(orgId: string, paymentId: string, by: string, reason: string) {
  const ref = paymentsRef(orgId).doc(paymentId);
  return db().runTransaction(async (tx) => {
    const payment = await tx.get(ref);
    if (!payment.exists) throw new HttpsError('not-found', 'That payment does not exist.');
    if (payment.get('status') !== 'submitted') throw new HttpsError('failed-precondition', 'This payment was already handled.');
    const orderDoc = ordersRef(orgId).doc(payment.get('orderId') as string);
    const order = await tx.get(orderDoc);
    const reference = payment.get('reference') as string | null;
    const refDoc = reference ? paymentRefsRef(orgId).doc(refKey(payment.get('network') as MomoNetwork | null, reference)) : null;
    const refSnap = refDoc ? await tx.get(refDoc) : null;

    const now = Timestamp.now();
    tx.update(ref, { status: 'rejected', rejectedReason: reason, verifiedBy: by, verifiedAt: now, updatedAt: now });
    // Free the reference only if this payment claimed it, so a genuine retry with the same ID still works.
    if (refDoc && refSnap?.exists && refSnap.get('paymentId') === paymentId) tx.delete(refDoc);
    if (order.exists && order.get('paymentState') !== 'paid') {
      const paid = (order.get('paidMinor') as number) ?? 0;
      tx.update(orderDoc, { paymentState: (paid > 0 ? 'partial' : 'unpaid') satisfies PaymentState, updatedAt: now });
    }
    return {
      orderNumber: (order.get('number') as number) ?? 0,
      customerId: (order.get('customerId') as string) ?? '',
      dueMinor: Math.max(0, ((order.get('totalMinor') as number) ?? 0) - ((order.get('paidMinor') as number) ?? 0)),
    };
  });
}
