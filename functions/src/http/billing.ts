import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { PLANS } from '../billing/plans';
import { initializeTransaction, verifyPaystackSignature } from '../billing/paystack';
import { APP_URL, PAYSTACK_SECRET_KEY } from '../config';
import type { PlanId } from '../domain/model';
import { orgRef } from '../tenant';
import { parse, requireMember } from './guards';

/**
 * SellEazy's own subscription billing through Paystack (ported from OrderFlow,
 * GHS only — Paystack Ghana accepts MoMo and cards). The plan only changes
 * when Paystack's signed webhook confirms the charge; the browser can never
 * set its own plan (firestore.rules blocks `subscription`).
 */
const RENEWAL_MS = 30 * 24 * 60 * 60 * 1000;

export const changePlan = onCall({ secrets: [PAYSTACK_SECRET_KEY] }, async (request) => {
  const { orgId } = await requireMember(request.auth, 'billing.manage');
  const { plan, email } = parse(
    z.object({ plan: z.enum(['free', 'starter', 'growth', 'pro']), email: z.string().email().optional() }),
    request.data,
    'Choose a plan.',
  );

  if (plan === 'free') {
    await orgRef(orgId).update({
      'subscription.plan': 'free', 'subscription.status': 'active', 'subscription.renewsAt': null,
      'subscription.paymentProvider': null, 'subscription.externalSubscriptionId': null, updatedAt: FieldValue.serverTimestamp(),
    });
    return { checkoutUrl: null };
  }

  const secretKey = PAYSTACK_SECRET_KEY.value();
  if (!secretKey || secretKey === 'unset') {
    throw new HttpsError('unimplemented', 'Paid plans are not switched on yet. Add a Paystack key on the server.');
  }
  // Phone sign-ups have a synthetic email Paystack cannot use; ask for a real one.
  const tokenEmail = request.auth?.token.email as string | undefined;
  const billingEmail = email ?? (tokenEmail && !tokenEmail.endsWith('.internal') ? tokenEmail : undefined);
  if (!billingEmail) throw new HttpsError('failed-precondition', 'Enter an email address for your receipts.');

  const { authorization_url: checkoutUrl, reference } = await initializeTransaction(secretKey, {
    email: billingEmail,
    amount: PLANS[plan].priceMinor,
    currency: 'GHS',
    callbackUrl: `${APP_URL.value() || `https://${process.env.GCLOUD_PROJECT}.web.app`}/settings/plan?paystack=return`,
    metadata: { orgId, plan },
  });
  logger.info('Paystack checkout started', { orgId, plan, reference });
  return { checkoutUrl };
});

export const billingWebhook = onRequest({ secrets: [PAYSTACK_SECRET_KEY] }, async (req, res) => {
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
  const secretKey = PAYSTACK_SECRET_KEY.value();
  if (!raw || !secretKey || !verifyPaystackSignature(raw, req.get('x-paystack-signature'), secretKey)) {
    res.status(401).send('Invalid signature');
    return;
  }
  try {
    const event = req.body as { event?: string; data?: Record<string, unknown> };
    if (event.event === 'charge.success' && event.data) {
      const meta = event.data.metadata as { orgId?: string; plan?: PlanId } | undefined;
      if (meta?.orgId && meta.plan && meta.plan in PLANS) {
        const authorization = event.data.authorization as { authorization_code?: string; reusable?: boolean } | undefined;
        const customer = event.data.customer as { customer_code?: string; email?: string } | undefined;
        await orgRef(meta.orgId).update({
          'subscription.plan': meta.plan,
          'subscription.status': 'active',
          'subscription.renewsAt': new Date(Date.now() + RENEWAL_MS).toISOString(),
          'subscription.paymentProvider': 'paystack',
          'subscription.externalCustomerId': customer?.customer_code ?? null,
          'subscription.externalSubscriptionId': authorization?.reusable ? authorization.authorization_code ?? null : null,
          'subscription.billingEmail': customer?.email ?? null,
          updatedAt: FieldValue.serverTimestamp(),
        });
        logger.info('Plan activated', meta);
      }
    }
    res.status(200).send('OK');
  } catch (err) {
    logger.error('Billing webhook failed', err);
    res.status(500).send('Retry');
  }
});
