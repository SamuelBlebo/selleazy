import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Thin wrapper over Paystack's REST API — the pieces changePlan,
 * billingWebhook and renewSubscriptions need. Follows Paystack's documented
 * API as of writing; verify against their current docs with a real
 * test-mode secret key before relying on this in production — payment
 * provider APIs shift, and none of this has been exercised against a live
 * account.
 */

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

async function paystackFetch<T>(secretKey: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  const body = (await response.json()) as { status: boolean; message?: string; data?: T };
  if (!response.ok || body.status === false) {
    throw new Error(body.message ?? `Paystack request failed (${response.status})`);
  }
  return body.data as T;
}

export interface InitializeTransactionResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

/**
 * Starts a hosted checkout: the customer pays on Paystack's page. For order
 * payment links pass the merchant's subaccount with bearer "subaccount",
 * so the money and the fee land on the merchant, not on SellEazy.
 */
export function initializeTransaction(
  secretKey: string,
  params: {
    email: string;
    amount: number;
    currency: string;
    callbackUrl?: string;
    metadata: Record<string, unknown>;
    reference?: string;
    channels?: string[];
    subaccount?: string;
    bearer?: 'account' | 'subaccount';
  },
): Promise<InitializeTransactionResult> {
  return paystackFetch(secretKey, '/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: params.email,
      amount: params.amount,
      currency: params.currency,
      metadata: params.metadata,
      ...(params.callbackUrl ? { callback_url: params.callbackUrl } : {}),
      ...(params.reference ? { reference: params.reference } : {}),
      ...(params.channels ? { channels: params.channels } : {}),
      ...(params.subaccount ? { subaccount: params.subaccount, bearer: params.bearer ?? 'subaccount' } : {}),
    }),
  });
}

/** Asks Paystack directly whether a charge succeeded. Webhook bodies are never trusted on their own. */
export function verifyTransaction<T>(secretKey: string, reference: string): Promise<T> {
  return paystackFetch(secretKey, `/transaction/verify/${encodeURIComponent(reference)}`);
}

export interface PaystackBank {
  name: string;
  code: string;
  type: string;
  active?: boolean;
}

/** Ghanaian banks and mobile money providers a merchant can be paid out to. */
export async function listSettlementBanks(secretKey: string): Promise<PaystackBank[]> {
  const [banks, momo] = await Promise.all([
    paystackFetch<PaystackBank[]>(secretKey, '/bank?currency=GHS&perPage=100'),
    paystackFetch<PaystackBank[]>(secretKey, '/bank?currency=GHS&type=mobile_money&perPage=100'),
  ]);
  const byCode = new Map<string, PaystackBank>();
  for (const b of [...momo, ...banks]) if (b.active !== false && !byCode.has(b.code)) byCode.set(b.code, b);
  return [...byCode.values()];
}

export interface SubaccountResult {
  subaccount_code: string;
  settlement_bank?: string;
  account_number?: string;
}

/** A merchant's own Paystack subaccount: order payments settle straight to their bank or MoMo wallet. SellEazy takes no cut. */
export function createSubaccount(secretKey: string, params: { businessName: string; bankCode: string; accountNumber: string; phone?: string | null }): Promise<SubaccountResult> {
  return paystackFetch(secretKey, '/subaccount', {
    method: 'POST',
    body: JSON.stringify({
      business_name: params.businessName,
      settlement_bank: params.bankCode,
      account_number: params.accountNumber,
      percentage_charge: 0,
      ...(params.phone ? { primary_contact_phone: params.phone } : {}),
    }),
  });
}

export interface ChargeAuthorizationResult {
  status: string;
  reference: string;
}

/**
 * Renewal charges — Paystack's own Subscription/Plan objects are
 * deliberately not used here (see renewSubscriptions.ts); this re-charges
 * the card on file from the first successful payment's `authorization_code`.
 */
export function chargeAuthorization(
  secretKey: string,
  params: { email: string; amount: number; currency: string; authorizationCode: string },
): Promise<ChargeAuthorizationResult> {
  return paystackFetch(secretKey, '/transaction/charge_authorization', {
    method: 'POST',
    body: JSON.stringify({
      email: params.email,
      amount: params.amount,
      currency: params.currency,
      authorization_code: params.authorizationCode,
    }),
  });
}

/** Paystack signs every webhook body with HMAC-SHA512 over the secret key — requests that fail this never touch tenant data. */
export function verifyPaystackSignature(rawBody: Buffer, header: string | undefined, secretKey: string): boolean {
  if (!header) return false;
  const expected = createHmac('sha512', secretKey).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(header, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
