import type { MomoNetwork } from '../domain/model';

/**
 * Seam for automatic mobile-money collection. Today every network uses
 * ManualVerification: the customer pays the merchant's own number and a
 * human checks the SMS (services/payments.ts). When SellEazy signs up for MTN
 * MoMo Collections, Telecel Cash or AirtelTigo Money APIs, implement this
 * interface for that network, register it below, and call
 * services/payments.ts' verifyPayment from its callback with
 * by: `provider:<network>`. The payments queue UI does not change; it just
 * gets shorter.
 */
export interface CollectionRequest {
  orgId: string;
  orderId: string;
  amountMinor: number;
  payerPhone: string;
  /** Shown on the customer's approval prompt. */
  description: string;
}

export type CollectionStatus = 'pending' | 'successful' | 'failed';

export interface MomoCollectionProvider {
  readonly network: MomoNetwork;
  /** False means a human verifies payments for this network. */
  readonly automatic: boolean;
  /** Sends the customer a payment prompt. Returns the provider's reference. */
  requestToPay(req: CollectionRequest): Promise<{ providerRef: string }>;
  checkStatus(providerRef: string): Promise<CollectionStatus>;
  /** Validates an inbound callback from the provider. */
  verifyCallback(headers: Record<string, string | undefined>, rawBody: Buffer): boolean;
}

export class ProviderNotConfiguredError extends Error {
  constructor(network: MomoNetwork) {
    super(`Automatic ${network} collection is not set up yet. Payments on this network are verified by hand.`);
  }
}

/** The default for every network today. */
export class ManualVerification implements MomoCollectionProvider {
  readonly automatic = false;
  constructor(readonly network: MomoNetwork) {}
  requestToPay(): Promise<{ providerRef: string }> {
    return Promise.reject(new ProviderNotConfiguredError(this.network));
  }
  checkStatus(): Promise<CollectionStatus> {
    return Promise.reject(new ProviderNotConfiguredError(this.network));
  }
  verifyCallback(): boolean {
    return false;
  }
}

const registry: Record<MomoNetwork, MomoCollectionProvider> = {
  mtn: new ManualVerification('mtn'), // future: MtnMomoCollections (momodeveloper.mtn.com)
  telecel: new ManualVerification('telecel'), // future: Telecel Cash merchant API
  airteltigo: new ManualVerification('airteltigo'), // future: AirtelTigo Money API
};

export const providerFor = (network: MomoNetwork) => registry[network];

/** Best guess at the network from a customer's message. */
export function guessNetwork(text: string): MomoNetwork | null {
  const t = text.toLowerCase();
  if (/telecel|vodafone|voda\b/.test(t)) return 'telecel';
  if (/airtel|tigo|at money/.test(t)) return 'airteltigo';
  if (/\bmtn\b|momo/.test(t)) return 'mtn';
  return null;
}
