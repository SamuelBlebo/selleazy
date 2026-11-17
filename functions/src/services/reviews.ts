import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { reviewText, shouldAskForReview, type ReviewSettings } from '../domain/reviews';
import { customerRef, db, loadCredentialsForOrg, ordersRef, orgRef } from '../tenant';
import { Outbox } from '../whatsapp/client';

/**
 * Sends the review request for a completed order, if the merchant turned it
 * on. The order and customer are marked in a transaction first, so a
 * repeated trigger never asks twice. Best-effort: a failure is only logged.
 */
export async function askForReview(orgId: string, orderId: string): Promise<void> {
  try {
    const org = await orgRef(orgId).get();
    const settings = org.get('bot.review') as Partial<ReviewSettings> | undefined;
    if (!settings?.enabled) return;

    const orderDoc = ordersRef(orgId).doc(orderId);
    const claim = await db().runTransaction(async (tx) => {
      const order = await tx.get(orderDoc);
      if (!order.exists || order.get('status') !== 'completed') return null;
      const customerId = order.get('customerId') as string;
      const cust = await tx.get(customerRef(orgId, customerId));
      const now = Timestamp.now();
      const ok = shouldAskForReview({
        settings,
        alreadyAskedForOrder: Boolean(order.get('reviewAskedAt')),
        lastAskedCustomerMs: (cust.get('lastReviewAskAt') as Timestamp | undefined)?.toMillis() ?? null,
        nowMs: now.toMillis(),
      });
      if (!ok) return null;
      tx.update(orderDoc, { reviewAskedAt: now });
      tx.set(customerRef(orgId, customerId), { lastReviewAskAt: now }, { merge: true });
      return { customerId, number: order.get('number') as number, customerName: (order.get('customerName') as string | null) ?? null };
    });
    if (!claim) return;

    const creds = await loadCredentialsForOrg(orgId);
    if (!creds) return;
    const body = reviewText(settings.message, { business: (org.get('name') as string) ?? 'us', customerName: claim.customerName, number: claim.number, link: settings.link! });
    const sent = await new Outbox(creds, orgId, claim.customerId, 'bot').text(body);
    if (!sent.ok) logger.info('Review request not delivered (likely outside the 24h window)', { orgId, orderId });
  } catch (err) {
    logger.warn('Review request failed', { orgId, orderId, err });
  }
}
