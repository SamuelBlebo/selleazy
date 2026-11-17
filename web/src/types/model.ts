import type { Currency } from '@/utils/format';

/** When the shop is open; the WhatsApp bot reads it (functions/src/domain/hours.ts). Days run Sunday (0) to Saturday (6). */
export interface DayHours { open: string; close: string }
export interface OpeningHours { enabled: boolean; timezone: string; days: Array<DayHours | null>; ordersWhenClosed: boolean }

/** A merchant's own question and answer; the WhatsApp bot replies with it (functions/src/nlu/faq.ts). */
export interface Faq {
  q: string;
  a: string;
  keywords?: string[];
}
import type { Timestamp } from 'firebase/firestore';

/**
 * SellEazy's tenant model, web side. Mirrors functions/src/domain/model.ts —
 * separate deployables, no shared workspace, so keep both in step.
 * Money is integer pesewas in every field ending `Minor`.
 */

export type BusinessType = 'food' | 'retail' | 'services' | 'mixed';
export type Role = 'owner' | 'manager' | 'cashier' | 'kitchen';
export type ItemKind = 'product' | 'service';
export type PlanId = 'free' | 'starter' | 'growth' | 'pro';
export type OrderStatus = 'pending' | 'confirmed' | 'in_progress' | 'ready' | 'out_for_delivery' | 'completed' | 'cancelled';
export type PaymentState = 'unpaid' | 'submitted' | 'partial' | 'paid' | 'refunded';
export type Fulfilment = 'delivery' | 'pickup' | 'dine_in' | 'appointment' | 'on_site';
export type OrderChannel = 'whatsapp_menu' | 'whatsapp_text' | 'manual' | 'qr';
export type MomoNetwork = 'mtn' | 'telecel' | 'airteltigo';
export type MovementReason = 'opening' | 'sale' | 'cancellation' | 'restock' | 'wastage' | 'correction' | 'return';

export interface OrgFeatures {
  kitchen: boolean;
  bookings: boolean;
  delivery: boolean;
  pickup: boolean;
  onSite: boolean;
}

export interface Subscription {
  plan: PlanId;
  status: 'active' | 'past_due' | 'cancelled';
  renewsAt: string | null;
  currentPeriodStart: string | null;
  ordersUsedThisPeriod: number;
  paymentProvider: 'paystack' | null;
  billingEmail?: string | null;
}

/** Settings → Reviews. Mirrors functions/src/domain/reviews.ts. */
export interface ReviewSettings {
  enabled: boolean;
  link: string;
  message: string;
}

export type SetupStepId = 'whatsapp' | 'items' | 'pay' | 'test';

export interface WhatsAppMirror {
  connected: boolean;
  phoneNumberId: string | null;
  wabaId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  /** coexistence = the number also stays in the WhatsApp Business app. Missing on older connections = cloud. */
  mode?: 'coexistence' | 'cloud' | null;
  connectedAt: Timestamp | null;
}

export interface Organization {
  name: string;
  slug: string;
  phone: string | null;
  area: string | null;
  businessType: BusinessType;
  category: string;
  currency: Currency;
  deliveryFeeMinor: number;
  features: OrgFeatures;
  ownerUid: string;
  /** phoneReplyPauseMinutes: how long the bot stays quiet after the owner replies from the phone app (Coexistence). 0 = off, missing = 30. */
  bot: { menuEnabled: boolean; freeTextEnabled: boolean; greeting: string; faqs?: Faq[]; hours?: OpeningHours; phoneReplyPauseMinutes?: number; review?: ReviewSettings };
  momo: { mtn: string | null; telecel: string | null; airteltigo: string | null; accountName: string | null };
  subscription: Subscription;
  /** Setup wizard: steps put off ("do this later") and whether the merchant reached the end. */
  setup?: { later: SetupStepId[]; finished: boolean };
  whatsapp: WhatsAppMirror;
  orderCounter: number;
  suspended: boolean;
  suspendedReason: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  orgId: string | null;
  role: Role | null;
}

export interface Member {
  fullName: string;
  contact: string;
  role: Role;
  createdAt: Timestamp;
}

export interface Invite {
  orgId: string;
  role: Role;
  name: string | null;
  contact: string;
  createdAt: Timestamp;
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
  trackStock: boolean;
  stock: number;
  lowStockAt: number;
  durationMinutes: number | null;
  requiresBooking: boolean;
  featured?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface StockMovement {
  itemId: string;
  itemName: string;
  change: number;
  balanceAfter: number;
  reason: MovementReason;
  orderId: string | null;
  orderNumber: number | null;
  note: string | null;
  by: string;
  at: Timestamp;
}

export interface Customer {
  name: string | null;
  phone: string;
  waProfileName?: string | null;
  address: string | null;
  note: string | null;
  tags: string[];
  orderCount: number;
  totalSpentMinor: number;
  lastOrderAt: Timestamp | null;
  lastMessageAt: Timestamp | null;
  /** Preview for the chat list; missing on chats from before it was stored. */
  lastMessageText?: string;
  lastMessageOut?: boolean;
  unreadCount: number;
  needsHuman: boolean;
  createdAt: Timestamp;
}

export interface Message {
  direction: 'in' | 'out';
  /** merchant_phone = typed in the WhatsApp Business app on a Coexistence number. */
  by: 'customer' | 'bot' | 'staff' | 'merchant_phone';
  type: string;
  body: string | null;
  /** mediaUrl: the photo or video of an image / video message (promotions). */
  extra?: { button?: string; options?: string[]; mediaUrl?: string } | null;
  failed?: boolean;
  createdAt: Timestamp | null;
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
  at: Timestamp;
  by: string;
  reason?: string | null;
}

export interface Order {
  number: number;
  status: OrderStatus;
  paymentState: PaymentState;
  paidMinor: number;
  fulfilment: Fulfilment;
  channel: OrderChannel;
  customerId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string | null;
  appointmentRequest: string | null;
  appointmentAt: Timestamp | null;
  lines: OrderLine[];
  hasProducts: boolean;
  hasServices: boolean;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  note: string | null;
  cancelReason: string | null;
  rider: { name: string; phone: string } | null;
  statusHistory: StatusEvent[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DraftOrder {
  customerId: string;
  customerName: string | null;
  text: string;
  lines: Array<{ itemId: string; name: string; quantity: number; unitPriceMinor: number; kind: ItemKind }>;
  unmatched: string[];
  confidence: number;
  fulfilment: Fulfilment | null;
  address: string | null;
  appointmentRequest: string | null;
  appointmentAt: Timestamp | null;
  status: 'open' | 'accepted' | 'dismissed';
  orderId: string | null;
  orderNumber?: number;
  createdAt: Timestamp;
}

export type PaymentFlag = 'amount_mismatch' | 'duplicate_reference' | 'amount_unknown';

export interface Payment {
  orderId: string;
  orderNumber: number;
  customerId: string;
  customerName: string;
  method: 'momo' | 'cash' | 'bank' | 'card';
  network: MomoNetwork | null;
  reference: string | null;
  claimedMinor: number | null;
  expectedMinor: number;
  amountMinor?: number;
  payerPhone: string | null;
  status: 'submitted' | 'verified' | 'rejected';
  flags: PaymentFlag[];
  duplicateOfOrderNumber: number | null;
  source: 'whatsapp' | 'staff';
  verifiedBy: string | null;
  verifiedAt: Timestamp | null;
  rejectedReason: string | null;
  createdAt: Timestamp;
}

export interface Broadcast {
  message: string;
  audienceSize: number;
  sentCount: number;
  failedCount: number;
  createdAt: Timestamp;
}
