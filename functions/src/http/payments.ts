import { logger } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { formatMoney, type Currency } from '../domain/money';
import { rejectPayment, submitPayment, verifyPayment } from '../services/payments';
import { loadCredentialsForOrg, orgRef } from '../tenant';
import { Outbox } from '../whatsapp/client';
import { paymentInstructions } from '../whatsapp/copy';
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
  await tellCustomer(
    orgId,
    r.customerId,
    r.fullyPaid
      ? `Payment of ${formatMoney(r.amountMinor, currency)} received for order #${r.orderNumber}. Thank you!`
      : `We received ${formatMoney(r.amountMinor, currency)} for order #${r.orderNumber}. ${formatMoney(r.balanceMinor, currency)} is still due.`,
  );
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
