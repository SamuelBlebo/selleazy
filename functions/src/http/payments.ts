import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { createSubaccount, listSettlementBanks } from '../billing/paystack';
import { PAYSTACK_SECRET_KEY } from '../config';
import type { Currency } from '../domain/money';
import { rejectPayment, submitPayment, verifyPayment } from '../services/payments';
import { loadCredentialsForOrg, orgRef } from '../tenant';
import { Outbox } from '../whatsapp/client';
import { paymentInstructions, paymentReceivedText } from '../whatsapp/copy';
import { parse, requireMember } from './guards';

async function tellCustomer(orgId: string, customerId: string, body: string) {
  try {
    const creds = await loadCredentialsForOrg(orgId);
    if (creds && customerId) await new Outbox(creds, orgId, customerId, 'bot').text(body);
  } catch (err) {
    logger.warn('Could not send payment update on WhatsApp', { orgId, err });
  }
}

export const verifyMomoPayment = onCall(async (request) => {
  const { orgId, uid } = await requireMember(request.auth, 'payments.verify');
  const { paymentId } = parse(z.object({ paymentId: z.string().min(1) }), request.data);
  const r = await verifyPayment(orgId, paymentId, uid);
  const currency = ((await orgRef(orgId).get()).get('currency') as Currency) ?? 'GHS';
  await tellCustomer(orgId, r.customerId, paymentReceivedText(r, currency));
  return r;
});

export const rejectMomoPayment = onCall(async (request) => {
  const { orgId, uid } = await requireMember(request.auth, 'payments.verify');
  const { paymentId, reason } = parse(z.object({ paymentId: z.string().min(1), reason: z.string().trim().min(2).max(200) }), request.data, 'Choose a reason.');
  const r = await rejectPayment(orgId, paymentId, uid, reason);
  const org = await orgRef(orgId).get();
  await tellCustomer(
    orgId,
    r.customerId,
    `We couldn't confirm your payment for order #${r.orderNumber} (${reason.toLowerCase()}).\n\n${paymentInstructions(r.dueMinor, org.get('momo'), (org.get('currency') as Currency) ?? 'GHS')}`,
  );
  return { ok: true as const };
});

/** Cash at the counter, or a MoMo payment the merchant already saw on their phone. Recorded and verified at once. */
export const recordPayment = onCall(async (request) => {
  const { orgId, uid } = await requireMember(request.auth, 'payments.verify');
  const input = parse(
    z.object({
      orderId: z.string().min(1),
      method: z.enum(['momo', 'cash', 'bank', 'card']),
      network: z.enum(['mtn', 'telecel', 'airteltigo']).nullable().optional(),
      reference: z.string().trim().max(40).nullable().optional(),
      amountMinor: z.number().int().min(1).max(100_000_000),
    }),
    request.data,
    'Enter the amount.',
  );
  const submitted = await submitPayment({
    orgId,
    orderId: input.orderId,
    method: input.method,
    network: input.network ?? null,
    reference: input.reference || null,
    amountMinor: input.amountMinor,
    payerPhone: null,
    source: 'staff',
    by: uid,
  });
  const r = await verifyPayment(orgId, submitted.paymentId, uid);
  return { ...r, flags: submitted.flags };
});

/* ------------------------- Paystack payment links ------------------------- */

function paystackKey(): string {
  const key = PAYSTACK_SECRET_KEY.value();
  if (!key || key === 'unset') throw new HttpsError('failed-precondition', 'Payment links are not switched on for this SellEazy server yet.');
  return key;
}

/** Banks and MoMo providers the merchant can be paid out to. */
export const listPayoutBanks = onCall({ secrets: [PAYSTACK_SECRET_KEY] }, async (request) => {
  await requireMember(request.auth, 'billing.manage');
  try {
    const banks = await listSettlementBanks(paystackKey());
    return { banks: banks.map((b) => ({ code: b.code, name: b.name, momo: b.type === 'mobile_money' })) };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error('Paystack bank list failed', err);
    throw new HttpsError('unavailable', "Couldn't reach Paystack. Try again in a minute.");
  }
});

/**
 * Creates the merchant's Paystack subaccount so payment-link money settles to
 * their own bank or MoMo wallet. Owner only. SellEazy takes no cut.
 */
export const setupPayouts = onCall({ secrets: [PAYSTACK_SECRET_KEY] }, async (request) => {
  const { orgId, uid } = await requireMember(request.auth, 'billing.manage');
  const input = parse(
    z.object({
      businessName: z.string().trim().min(2).max(100),
      bankCode: z.string().trim().min(1).max(40),
      bankName: z.string().trim().min(1).max(100),
      accountNumber: z.string().trim().regex(/^[0-9]{6,20}$/),
    }),
    request.data,
    'Check the business name and account number.',
  );
  const org = await orgRef(orgId).get();
  let code: string;
  try {
    code = (await createSubaccount(paystackKey(), { ...input, phone: (org.get('phone') as string) ?? null })).subaccount_code;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.warn('Paystack subaccount failed', { orgId, err });
    throw new HttpsError('invalid-argument', `Paystack didn't accept that account: ${(err as Error).message}`);
  }
  await orgRef(orgId).update({
    paystack: {
      subaccountCode: code,
      businessName: input.businessName,
      bankName: input.bankName,
      accountLast4: input.accountNumber.slice(-4),
      setupBy: uid,
      setupAt: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true as const, bankName: input.bankName, accountLast4: input.accountNumber.slice(-4) };
});
