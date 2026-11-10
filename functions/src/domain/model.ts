/**
 * SellEazy's tenant model, server side. The web app keeps its own copy in
 * web/src/types — two separate deployables, no shared workspace — so a change
 * here must be mirrored there.
 *
 *   users/{uid}                              -> { orgId, role }   (written only by functions)
 *   organizations/{orgId}                    -> profile, features, subscription, WhatsApp mirror, MoMo numbers
 *     /members/{uid}                         -> staff list
 *     /invites/{emailKey}                    -> pending staff invites
 *     /items/{itemId}                        -> catalog: products AND services
 *     /stockMovements/{id}                   -> every stock change, append-only
 *     /customers/{waId}                      -> people who messaged the business
 *       /messages/{id}                       -> one WhatsApp conversation, both directions
 *     /orders/{orderId}                      -> orders, product and/or service lines
 *     /draftOrders/{id}                      -> typed orders SellEazy read, waiting for a human to confirm
 *     /payments/{paymentId}                  -> MoMo/cash payments and their verification
 *     /paymentRefs/{network_ref}             -> uniqueness index for MoMo transaction IDs
 *     /sessions/{waId}                       -> WhatsApp bot conversation state
 *     /broadcasts/{id}, /qrCodes/{id}, /auditLog/{id}
 *   whatsappAccounts/{phoneNumberId}         -> tenant routing + Meta access token (functions only)
 *   webhookEvents/{waMessageId}              -> durable inbound queue (functions only)
 *   invites/{emailKey}                       -> invite lookup at sign-in (functions only)
 *   platformAdmins/{uid}, featureFlags, platformLogs, rateLimits
 *
 * Money is always integer pesewas (GH₵ 1.00 = 100) in fields ending in `Minor`.
 */

export type BusinessType = 'food' | 'retail' | 'services' | 'mixed';
export type Role = 'owner' | 'manager' | 'cashier' | 'kitchen';
export type ItemKind = 'product' | 'service';
export type PlanId = 'free' | 'starter' | 'growth' | 'pro';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';

export type PaymentState = 'unpaid' | 'submitted' | 'partial' | 'paid' | 'refunded';
export type Fulfilment = 'delivery' | 'pickup' | 'dine_in' | 'appointment' | 'on_site';
export type OrderChannel = 'whatsapp_menu' | 'whatsapp_text' | 'manual' | 'qr';
export type MomoNetwork = 'mtn' | 'telecel' | 'airteltigo';
export type PaymentMethod = 'momo' | 'cash' | 'bank' | 'card';
export type MovementReason = 'opening' | 'sale' | 'cancellation' | 'restock' | 'wastage' | 'correction' | 'return';

export interface OrgFeatures {
  /** Kitchen display + dine-in. Food businesses. */
  kitchen: boolean;
  /** Service lines can carry a requested appointment time. */
  bookings: boolean;
  delivery: boolean;
  pickup: boolean;
  /** Service providers who go to the customer (cleaners, mobile hairdressers, repairs). */
  onSite: boolean;
}

export function defaultFeatures(type: BusinessType): OrgFeatures {
  return {
    kitchen: type === 'food',
    bookings: type === 'services' || type === 'mixed',
    delivery: type !== 'services',
    pickup: type !== 'services',
    onSite: false,
  };
}

export interface OrderLine {
  itemId: string;
  kind: ItemKind;
  name: string;
  unitPriceMinor: number;
  quantity: number;
  durationMinutes: number | null;
}

export interface StatusEvent {
  status: OrderStatus;
  at: Date | FirebaseFirestore.Timestamp;
  by: string;
  reason?: string | null;
}

export interface CatalogItem {
  kind: ItemKind;
  name: string;
  description: string;
  category: string;
  priceMinor: number;
  active: boolean;
  aliases: string[];
  imageUrl: string | null;
  imagePath: string | null;
  sku: string | null;
  /** Products only. Services ignore stock. */
  trackStock: boolean;
  stock: number;
  lowStockAt: number;
  /** Services only. */
  durationMinutes: number | null;
  requiresBooking: boolean;
}

export interface WhatsappCredentials {
  phoneNumberId: string;
  businessAccountId: string;
  displayPhone: string;
  accessToken: string;
}

export interface WhatsappAccount extends WhatsappCredentials {
  organizationId: string;
  webhookStatus: 'pending' | 'verified' | 'disconnected';
}
