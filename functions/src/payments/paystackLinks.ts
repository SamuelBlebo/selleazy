import type { OrderStatus, PaymentState } from '../domain/model';

/**
 * Automatic payment confirmation with Paystack payment links. The customer
 * pays MoMo or card on Paystack's page, the money settles to the merchant's
 * own Paystack subaccount, and the signed webhook confirms the order.
 * Manual Transaction ID checks stay as the fallback.
 *
 * This file is the pure part (amounts, decisions), tested without Firestore.
 * services/payLinks.ts and http/billing.ts do the writes.
 */

export type PayMode = 'link' | 'manual' | 'both';

export interface PaymentSettings {
  /** How customers pay. Missing = manual (what every merchant had before). */
  mode: PayMode;
  /** true: the Paystack fee is added to what the customer pays. false: the merchant absorbs it. */
  customerPaysFee: boolean;
  /** Minutes after the order before one reminder with the same link. 0 = no reminder. */
  reminderMinutes: number;
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = { mode: 'manual', customerPaysFee: false, reminderMinutes: 30 };

/**
 * Paystack Ghana's local transaction fee (MoMo and Ghanaian cards), in basis
 * points: 1.95%. Check paystack.com/gh/pricing before launch; change it here only.
 */
export const PAYSTACK_GH_FEE_BPS = 195;

/** What the customer is asked to pay so the merchant still nets `dueMinor` after Paystack's fee. */
export function payLinkAmount(dueMinor: number, customerPaysFee: boolean): { amountMinor: number; feeMinor: number } {
  if (!customerPaysFee || dueMinor <= 0) return { amountMinor: dueMinor, feeMinor: 0 };
  const amountMinor = Math.ceil((dueMinor * 10000) / (10000 - PAYSTACK_GH_FEE_BPS));
  return { amountMinor, feeMinor: amountMinor - dueMinor };
}

export interface PayLink {
  reference: string;
  url: string;
  /** What the customer pays on Paystack (due + fee if they pay it). */
  amountMinor: number;
  /** Fee added on top for the customer; 0 when the merchant pays it. */
  feeMinor: number;
}

/** How much of a Paystack charge counts toward the order: the fee the customer added is not the merchant's. */
export function creditFromCharge(paidMinor: number, reference: string, link: Pick<PayLink, 'reference' | 'feeMinor'> | null | undefined): number {
  const fee = link && link.reference === reference ? link.feeMinor : 0;
  return Math.max(0, paidMinor - fee);
}

export type SettleFlag = 'amount_mismatch' | 'order_cancelled';

/**
 * Applies a verified payment to an order. Shared by staff verification and
 * provider (Paystack) confirmation so both move the order the same way.
 */
export function settle(order: { totalMinor: number; paidMinor: number; status: OrderStatus }, amountMinor: number) {
  const dueBefore = Math.max(0, order.totalMinor - order.paidMinor);
  const paidMinor = order.paidMinor + amountMinor;
  const fullyPaid = paidMinor >= order.totalMinor;
  const flags: SettleFlag[] = [];
  if (amountMinor !== dueBefore) flags.push('amount_mismatch');
  if (order.status === 'cancelled') flags.push('order_cancelled');
  return {
    paidMinor,
    fullyPaid,
    paymentState: (fullyPaid ? 'paid' : 'partial') as PaymentState,
    confirms: fullyPaid && order.status === 'pending',
    balanceMinor: Math.max(0, order.totalMinor - paidMinor),
    flags,
  };
}

/** The bits of Paystack's GET /transaction/verify response we rely on. */
export interface VerifiedCharge {
  status?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  channel?: string;
  paid_at?: string;
  metadata?: unknown;
  authorization?: { bank?: string | null; mobile_money_number?: string | null } | null;
}

export type OrderChargeCheck =
  | { ok: true; orgId: string; orderId: string; reference: string; amountMinor: number; method: 'momo' | 'card' }
  | { ok: false; reason: string };

/** Accepts a charge only if Paystack itself says it succeeded, in cedis, for an order we created. */
export function checkOrderCharge(charge: VerifiedCharge, expectedReference: string): OrderChargeCheck {
  const meta = (typeof charge.metadata === 'string' ? safeJson(charge.metadata) : charge.metadata) as { kind?: unknown; orgId?: unknown; orderId?: unknown } | null;
  if (charge.status !== 'success') return { ok: false, reason: `status ${charge.status ?? 'unknown'}` };
  if (charge.reference !== expectedReference) return { ok: false, reason: 'reference mismatch' };
  if (charge.currency !== 'GHS') return { ok: false, reason: `currency ${charge.currency ?? 'unknown'}` };
  if (!meta || meta.kind !== 'order' || typeof meta.orgId !== 'string' || typeof meta.orderId !== 'string') return { ok: false, reason: 'not an order payment' };
  if (!Number.isInteger(charge.amount) || (charge.amount ?? 0) <= 0) return { ok: false, reason: 'bad amount' };
  return { ok: true, orgId: meta.orgId, orderId: meta.orderId, reference: expectedReference, amountMinor: charge.amount!, method: charge.channel === 'card' ? 'card' : 'momo' };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Payment doc id for a Paystack charge: the same reference always maps to the same doc, so a repeat webhook is a no-op. */
export const paystackPaymentId = (reference: string) => `paystack_${reference.replace(/[^\w-]/g, '_')}`;

/** Paystack needs an email; customers on WhatsApp don't give one. Never emailed by SellEazy. */
export const customerEmail = (waId: string) => `wa${waId.replace(/\D/g, '')}@customers.selleazy.com`;

const DAY_MS = 24 * 60 * 60000;

/**
 * One reminder per unpaid order, only while WhatsApp still allows a
 * free-form message (24 hours after the customer's last message).
 */
export function reminderDecision(o: {
  nowMs: number;
  paymentState: PaymentState;
  status: OrderStatus;
  lastInboundMs: number | null;
}): 'send' | 'skip_paid' | 'skip_cancelled' | 'skip_window' {
  if (o.paymentState === 'paid' || o.paymentState === 'refunded') return 'skip_paid';
  if (o.status === 'cancelled') return 'skip_cancelled';
  if (o.lastInboundMs === null || o.nowMs - o.lastInboundMs > DAY_MS - 5 * 60000) return 'skip_window';
  return 'send';
}
