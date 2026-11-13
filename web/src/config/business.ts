import type { BusinessType, Faq, Fulfilment, MovementReason, Order, OrderStatus, OrgFeatures } from '@/types';

/**
 * Everything that changes with what a merchant sells. One order flow for all
 * merchants (functions/src/domain/orderFlow.ts); only the words differ.
 */
export const BUSINESS_TYPES: Array<{ id: BusinessType; label: string; hint: string; examples: string }> = [
  { id: 'retail', label: 'I sell products', hint: 'Stock, delivery and pickup', examples: 'Fashion, beauty products, phones, groceries, pharmacy' },
  { id: 'services', label: 'I offer services', hint: 'Bookings and appointments', examples: 'Salon, barber, tailor, repairs, cleaning, events' },
  { id: 'food', label: 'I sell food', hint: 'Adds a kitchen screen', examples: 'Restaurant, chop bar, home cook, bakery, drinks' },
  { id: 'mixed', label: 'Products and services', hint: 'Both, in one catalogue', examples: 'Salon that sells hair products, phone shop with repairs' },
];

export const CATEGORIES: Record<BusinessType, string[]> = {
  retail: ['Fashion', 'Beauty & cosmetics', 'Phones & electronics', 'Groceries', 'Pharmacy', 'Home & furniture', 'Books & stationery', 'Other'],
  services: ['Salon & barbering', 'Tailoring', 'Repairs', 'Cleaning', 'Events & photography', 'Health & fitness', 'Tutoring', 'Other'],
  food: ['Restaurant', 'Chop bar', 'Home cooking', 'Bakery & pastries', 'Drinks', 'Other'],
  mixed: ['Salon & beauty', 'Phones & repairs', 'Fashion & tailoring', 'Other'],
};

export function defaultFeatures(type: BusinessType): OrgFeatures {
  return { kitchen: type === 'food', bookings: type === 'services' || type === 'mixed', delivery: type !== 'services', pickup: type !== 'services', onSite: false };
}

/** Category words win over business-type words. Mirrors functions/src/whatsapp/copy.ts vocabulary(). */
const CATEGORY_WORDS: Record<string, { catalog: string; item: string }> = {
  'Salon & barbering': { catalog: 'Styles & prices', item: 'style' },
  'Salon & beauty': { catalog: 'Styles & products', item: 'item' },
  Tailoring: { catalog: 'Styles', item: 'style' },
  'Fashion & tailoring': { catalog: 'Styles', item: 'style' },
  Repairs: { catalog: 'Repairs', item: 'repair' },
  'Events & photography': { catalog: 'Packages', item: 'package' },
  'Health & fitness': { catalog: 'Sessions', item: 'session' },
  Tutoring: { catalog: 'Lessons', item: 'lesson' },
  Drinks: { catalog: 'Drinks menu', item: 'drink' },
};

export function vocabulary(type: BusinessType, category?: string | null) {
  return {
    catalog: type === 'food' ? 'Menu' : type === 'services' ? 'Services' : type === 'retail' ? 'Products' : 'Catalogue',
    item: type === 'food' ? 'dish' : type === 'services' ? 'service' : type === 'retail' ? 'product' : 'item',
    ...(category ? CATEGORY_WORDS[category] : undefined),
    order: type === 'services' ? 'booking' : 'order',
  };
}

/** Status labels: a salon's in_progress reads "In progress", a restaurant's "Preparing". */
export function statusLabel(status: OrderStatus, order: Pick<Order, 'fulfilment' | 'hasProducts'>, type: BusinessType): string {
  switch (status) {
    case 'pending':
      return 'New';
    case 'confirmed':
      return order.hasProducts ? 'Confirmed' : 'Booked';
    case 'in_progress':
      return !order.hasProducts ? 'In progress' : type === 'food' ? 'Preparing' : 'Packing';
    case 'ready':
      return order.fulfilment === 'pickup' ? 'Ready for pickup' : 'Ready';
    case 'out_for_delivery':
      return 'Out for delivery';
    case 'completed':
      return order.fulfilment === 'delivery' ? 'Delivered' : order.fulfilment === 'pickup' ? 'Collected' : 'Done';
    case 'cancelled':
      return 'Cancelled';
  }
}

/** Label for the button that moves an order to `to`. */
export function actionLabel(to: OrderStatus, order: Pick<Order, 'fulfilment' | 'hasProducts'>, type: BusinessType): string {
  switch (to) {
    case 'confirmed':
      return order.hasProducts ? 'Confirm' : 'Confirm booking';
    case 'in_progress':
      return !order.hasProducts ? 'Start' : type === 'food' ? 'Start preparing' : 'Start packing';
    case 'ready':
      return 'Mark ready';
    case 'out_for_delivery':
      return 'Send out';
    case 'completed':
      return order.fulfilment === 'delivery' ? 'Mark delivered' : order.fulfilment === 'pickup' ? 'Mark collected' : 'Mark done';
    default:
      return 'Update';
  }
}

/** Mirrors functions/src/domain/orderFlow.ts nextStatus. */
export function nextStatus(order: Pick<Order, 'status' | 'fulfilment' | 'lines'>): OrderStatus | null {
  const servicesOnly = order.lines.every((l) => l.kind === 'service');
  switch (order.status) {
    case 'pending':
      return 'confirmed';
    case 'confirmed':
      return 'in_progress';
    case 'in_progress':
      return servicesOnly || order.fulfilment === 'appointment' || order.fulfilment === 'on_site' ? 'completed' : 'ready';
    case 'ready':
      return order.fulfilment === 'delivery' ? 'out_for_delivery' : 'completed';
    case 'out_for_delivery':
      return 'completed';
    default:
      return null;
  }
}

export const isOpen = (s: OrderStatus) => s !== 'completed' && s !== 'cancelled';

export const FULFILMENT_LABEL: Record<Fulfilment, string> = {
  delivery: 'Delivery',
  pickup: 'Pickup',
  dine_in: 'Eat in',
  appointment: 'At the shop',
  on_site: 'At customer',
};

export function fulfilmentOptions(features: OrgFeatures, hasProducts: boolean): Fulfilment[] {
  if (!hasProducts) return ['appointment', ...(features.onSite ? (['on_site'] as Fulfilment[]) : [])];
  const opts: Fulfilment[] = [];
  if (features.delivery) opts.push('delivery');
  if (features.pickup) opts.push('pickup');
  if (features.kitchen) opts.push('dine_in');
  return opts.length ? opts : ['pickup'];
}

export const MOVEMENT_LABEL: Record<MovementReason, string> = {
  opening: 'Starting stock',
  sale: 'Sold',
  cancellation: 'Returned (cancelled)',
  restock: 'Restock',
  wastage: 'Wastage',
  correction: 'Count correction',
  return: 'Customer return',
};

/**
 * Starter questions a merchant can add with one tap, then edit. Answers are
 * examples to change, not facts about the business. Delivery, payment,
 * location and prices are already answered from Settings.
 */
const FAQ_COMMON: Faq[] = [
  { q: 'What time do you open?', a: 'We are open Monday to Saturday, 8am to 7pm.', keywords: ['closing time', 'close', 'hours', 'sunday', 'weekend', 'today'] },
];

const FAQ_BY_TYPE: Record<BusinessType, Faq[]> = {
  retail: [
    { q: 'Can I return or exchange an item?', a: 'Yes, within 3 days with the receipt, if the item is unused.', keywords: ['refund', 'exchange', 'return'] },
    { q: 'Do you have other sizes or colours?', a: 'Tell us the item and the size or colour you want, and we will check for you.', keywords: ['size', 'colour', 'color'] },
    { q: 'Is it original?', a: 'Yes, everything we sell is original.', keywords: ['original', 'fake', 'genuine', 'quality'] },
  ],
  services: [
    { q: 'How do I book?', a: 'Tap "Explore more", choose a service and tell us the day and time you want. We will confirm it here.', keywords: ['appointment', 'book', 'booking', 'schedule'] },
    { q: 'Can I cancel or reschedule?', a: 'Yes. Message us at least 24 hours before your appointment.', keywords: ['cancel', 'reschedule', 'change my time', 'postpone'] },
    { q: 'Do you do home service?', a: 'Yes, we can come to you for an extra fee. Tell us your area.', keywords: ['home service', 'come to my house', 'come to me'] },
  ],
  food: [
    { q: 'Do you cater for events?', a: 'Yes! Tell us the date, number of people and what you would like, and we will send a price.', keywords: ['catering', 'party', 'event', 'wedding', 'funeral', 'bulk'] },
    { q: 'How long does an order take?', a: 'Usually 30 to 45 minutes, plus delivery time.', keywords: ['how long', 'wait', 'ready'] },
    { q: 'Is it spicy?', a: 'You can ask for mild or extra spicy when you order.', keywords: ['pepper', 'spicy', 'hot'] },
  ],
  mixed: [
    { q: 'How do I book?', a: 'Tap "Explore more", choose a service and tell us the day and time you want. We will confirm it here.', keywords: ['appointment', 'book', 'booking'] },
    { q: 'Can I return or exchange an item?', a: 'Yes, within 3 days with the receipt, if the item is unused.', keywords: ['refund', 'exchange', 'return'] },
  ],
};

const FAQ_BY_CATEGORY: Record<string, Faq[]> = {
  'Salon & barbering': [
    { q: 'Do I need to bring my own hair?', a: 'You can bring your own, or we can provide it for an extra cost.', keywords: ['attachment', 'extensions', 'braiding hair', 'wig'] },
    { q: 'How long does it take?', a: 'It depends on the style. Most take 2 to 5 hours. Ask us about a specific style.', keywords: ['how long', 'hours', 'duration'] },
  ],
  'Salon & beauty': [
    { q: 'Do I need to bring my own hair?', a: 'You can bring your own, or we can provide it for an extra cost.', keywords: ['attachment', 'extensions', 'braiding hair', 'wig'] },
  ],
  Tailoring: [
    { q: 'How long does sewing take?', a: 'Usually 5 to 7 days. Rush orders cost extra.', keywords: ['how long', 'ready', 'rush', 'urgent'] },
    { q: 'Do you need my measurements?', a: 'Yes. Come in to be measured, or send your measurements here.', keywords: ['measurement', 'measure', 'size'] },
  ],
  Repairs: [
    { q: 'Do you give a warranty?', a: 'Yes, 30 days on parts and labour.', keywords: ['warranty', 'guarantee'] },
    { q: 'How long does a repair take?', a: 'Most repairs are done the same day. We will tell you after checking.', keywords: ['how long', 'ready', 'same day'] },
  ],
  'Phones & repairs': [
    { q: 'Do you give a warranty?', a: 'Yes, 30 days on parts and labour.', keywords: ['warranty', 'guarantee'] },
  ],
  Pharmacy: [
    { q: 'Do I need a prescription?', a: 'Some medicines need a prescription. Send us a photo of it here.', keywords: ['prescription', 'doctor'] },
  ],
};

export function suggestedFaqs(type: BusinessType, category?: string | null): Faq[] {
  return [...FAQ_COMMON, ...(FAQ_BY_TYPE[type] ?? []), ...((category && FAQ_BY_CATEGORY[category]) || [])];
}
