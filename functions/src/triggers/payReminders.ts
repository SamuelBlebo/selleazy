import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type { OrderStatus, PaymentState } from '../domain/model';
import { formatMoney, type Currency } from '../domain/money';
import { reminderDecision } from '../payments/paystackLinks';
import { customerRef, db, loadCredentialsForOrg, orgRef } from '../tenant';
import { Outbox } from '../whatsapp/client';

/**
 * One gentle reminder per unpaid order, with the same payment link, once
 * its remindAt passes (Settings → Payments, default 30 minutes). The order
 * is claimed in a transaction before sending, so two overlapping runs never
 * remind twice. Outside WhatsApp's 24-hour window it is skipped: that needs
 * an approved template (Phase 5).
 */
export const sendPayReminders = onSchedule({ schedule: 'every 5 minutes', retryCount: 0 }, async () => {
  const now = Timestamp.now();
  const due = await db().collectionGroup('orders').where('payLink.remindedAt', '==', null).where('payLink.remindAt', '<=', now).limit(100).get();

  for (const snap of due.docs) {
    const orgId = snap.ref.parent.parent!.id;
    try {
      const claim = await db().runTransaction(async (tx) => {
        const order = await tx.get(snap.ref);
        if (!order.exists || order.get('payLink.remindedAt') !== null) return null;
        const customerId = order.get('customerId') as string;
        const cust = await tx.get(customerRef(orgId, customerId));
        const decision = reminderDecision({
          nowMs: now.toMillis(),
          paymentState: order.get('paymentState') as PaymentState,
          status: order.get('status') as OrderStatus,
          lastInboundMs: (cust.get('lastInboundAt') as Timestamp | undefined)?.toMillis() ?? null,
        });
        tx.update(snap.ref, { 'payLink.remindedAt': now, 'payLink.reminder': decision });
        if (decision !== 'send') return null;
        return {
          customerId,
          number: order.get('number') as number,
          url: order.get('payLink.url') as string,
          amountMinor: order.get('payLink.amountMinor') as number,
        };
      });
      if (!claim) continue;

      const [creds, org] = await Promise.all([loadCredentialsForOrg(orgId), orgRef(orgId).get()]);
      if (!creds) continue;
      const currency = (org.get('currency') as Currency) ?? 'GHS';
      await new Outbox(creds, orgId, claim.customerId, 'bot').text(
        `A quick reminder: order #${claim.number} is waiting for payment of ${formatMoney(claim.amountMinor, currency)}.\nPay by MoMo or card here:\n${claim.url}`,
      );
    } catch (err) {
      logger.error('Payment reminder failed', { orgId, orderId: snap.id, err });
    }
  }
});
