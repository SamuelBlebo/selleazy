import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { initializeTransaction } from '../billing/paystack';
import { PAYSTACK_SECRET_KEY } from '../config';
import { customerEmail, DEFAULT_PAYMENT_SETTINGS, payLinkAmount, type PayLink, type PaymentSettings } from '../payments/paystackLinks';
import { ordersRef, orgRef } from '../tenant';

export function paymentSettingsOf(org: FirebaseFirestore.DocumentSnapshot): PaymentSettings {
  return { ...DEFAULT_PAYMENT_SETTINGS, ...((org.get('paymentSettings') as Partial<PaymentSettings> | undefined) ?? {}) };
}

/**
 * Creates a Paystack payment link for what is still due on an order and
 * stores it on the order. Returns null (and the bot falls back to manual
 * MoMo instructions) when links are off, the merchant has no Paystack
 * subaccount yet, or Paystack fails. An order is never lost over a link.
 *
 * The calling function must bind PAYSTACK_SECRET_KEY.
 */
export async function createPayLink(orgId: string, orderId: string): Promise<PayLink | null> {
  try {
    const [org, order] = await Promise.all([orgRef(orgId).get(), ordersRef(orgId).doc(orderId).get()]);
    const settings = paymentSettingsOf(org);
    const subaccount = org.get('paystack.subaccountCode') as string | undefined;
    // Links are cedis only; a business priced in another currency keeps manual payments.
    if (settings.mode === 'manual' || !subaccount || !order.exists || (order.get('currency') ?? 'GHS') !== 'GHS') return null;
    const secretKey = PAYSTACK_SECRET_KEY.value();
    if (!secretKey || secretKey === 'unset') return null;

    const dueMinor = Math.max(0, (order.get('totalMinor') as number) - ((order.get('paidMinor') as number) ?? 0));
    if (dueMinor <= 0) return null;
    const { amountMinor, feeMinor } = payLinkAmount(dueMinor, settings.customerPaysFee);
    const reference = `se_${orderId}_${Date.now().toString(36)}`;
    const r = await initializeTransaction(secretKey, {
      email: customerEmail(order.get('customerId') as string),
      amount: amountMinor,
      currency: 'GHS',
      reference,
      channels: ['mobile_money', 'card'],
      subaccount,
      bearer: 'subaccount',
      metadata: { kind: 'order', orgId, orderId, orderNumber: order.get('number') },
    });
    const link: PayLink = { reference: r.reference || reference, url: r.authorization_url, amountMinor, feeMinor };
    const now = Timestamp.now();
    await order.ref.update({
      payLink: {
        ...link,
        dueMinor,
        createdAt: now,
        remindAt: settings.reminderMinutes > 0 ? Timestamp.fromMillis(now.toMillis() + settings.reminderMinutes * 60000) : null,
        remindedAt: null,
      },
      updatedAt: now,
    });
    return link;
  } catch (err) {
    logger.error('Could not create a payment link; falling back to manual MoMo', { orgId, orderId, err });
    return null;
  }
}
