import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import type { BusinessType, CatalogItem, Fulfilment, OrderStatus, PlanId } from '../domain/model';
import { PLANS } from '../billing/plans';
import { itemsRef, loadCredentialsForOrg, orgRef, stockMovementsRef } from '../tenant';
import { askForReview } from '../services/reviews';
import { Outbox } from '../whatsapp/client';
import { statusMessage } from '../whatsapp/copy';

/** Sends the customer a WhatsApp update whenever an order changes status. */
export const onOrderStatusChange = onDocumentUpdated('organizations/{orgId}/orders/{orderId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.status === after.status) return;

  const { orgId } = event.params;
  const org = await orgRef(orgId).get();
  const message = statusMessage(after.status as OrderStatus, {
    number: after.number as number,
    businessType: (org.get('businessType') as BusinessType) ?? 'retail',
    fulfilment: after.fulfilment as Fulfilment,
    hasProducts: after.hasProducts === true,
    rider: (after.rider as { name: string; phone: string } | null) ?? null,
    appointmentAt: (after.appointmentAt as Timestamp | null)?.toDate() ?? null,
    shopArea: (org.get('area') as string) ?? null,
    reason: (after.cancelReason as string | null) ?? null,
  });
  if (!message) return;
  const creds = await loadCredentialsForOrg(orgId);
  if (!creds) {
    logger.info('Status changed but the business has no WhatsApp connected', { orgId });
    return;
  }
  await new Outbox(creds, orgId, after.customerId as string, 'bot').text(message);
  // Done: ask for a review right after the "done" update, if the merchant turned it on.
  if (after.status === 'completed') await askForReview(orgId, event.params.orderId);
});

/** A product created with starting stock gets an "opening" movement, so the stock history always adds up. */
export const onItemCreated = onDocumentCreated('organizations/{orgId}/items/{itemId}', async (event) => {
  const item = event.data?.data() as CatalogItem | undefined;
  if (!item) return;

  // The plan's item limit. The browser also disables "Add", but rules can't count, so check here:
  // an item over the limit is switched off, so customers never see it.
  const { orgId } = event.params;
  const plan = PLANS[((await orgRef(orgId).get()).get('subscription.plan') as PlanId) ?? 'free'] ?? PLANS.free;
  if (plan.itemLimit !== null) {
    const count = (await itemsRef(orgId).count().get()).data().count;
    if (count > plan.itemLimit) {
      await event.data!.ref.update({ active: false });
      logger.info('Item over plan limit switched off', { orgId, itemId: event.params.itemId, count, limit: plan.itemLimit });
      return;
    }
  }

  if (item.kind !== 'product' || !item.trackStock || !item.stock) return;
  await stockMovementsRef(event.params.orgId).add({
    itemId: event.params.itemId, itemName: item.name, change: item.stock, balanceAfter: item.stock, reason: 'opening',
    orderId: null, orderNumber: null, note: 'Starting stock', by: 'selleazy', at: Timestamp.now(),
  });
});
