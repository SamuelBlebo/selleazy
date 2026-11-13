import type { BusinessType, Fulfilment, OrderLine, OrderStatus } from '../domain/model';
import { formatMoney, type Currency } from '../domain/money';

/**
 * Words customers see, by what the merchant sells and their category: a
 * restaurant has a menu, a shop has best sellers, a salon has styles and a
 * price list. Button titles stay within WhatsApp's 20 characters.
 * Mirrors web/src/config/business.ts vocabulary().
 */
export interface Words {
  /** "See our ___" */
  catalog: string;
  /** List button */
  button: string;
  /** Button that opens the full list after the top picks */
  explore: string;
  topPicks: string;
  /** Card button for a product / a service */
  pick: string;
  book: string;
  order: 'order' | 'booking';
  item: string;
  pricesIntro: string;
}

const BY_TYPE: Record<BusinessType, Words> = {
  food: { catalog: 'menu', button: 'View menu', explore: 'Full menu', topPicks: "Today's favourites", pick: 'Order this', book: 'Book this', order: 'order', item: 'dish', pricesIntro: "Here's our menu with prices:" },
  retail: { catalog: 'shop', button: 'Browse shop', explore: 'Shop all', topPicks: 'Best sellers', pick: 'Add to cart', book: 'Book this', order: 'order', item: 'product', pricesIntro: 'Here are our prices:' },
  services: { catalog: 'services', button: 'See services', explore: 'All services', topPicks: 'Popular services', pick: 'Add to cart', book: 'Book this', order: 'booking', item: 'service', pricesIntro: "Here's our price list:" },
  mixed: { catalog: 'products and services', button: 'See all', explore: 'See everything', topPicks: 'Popular right now', pick: 'Add to cart', book: 'Book this', order: 'order', item: 'item', pricesIntro: 'Here are our prices:' },
};

const BY_CATEGORY: Record<string, Partial<Words>> = {
  'Salon & barbering': { catalog: 'styles and prices', button: 'See styles', explore: 'All styles & prices', topPicks: 'Popular styles', item: 'style', book: 'Book this style' },
  'Salon & beauty': { catalog: 'styles, products and prices', button: 'See styles', explore: 'All styles & prices', topPicks: 'Popular styles', item: 'style' },
  Tailoring: { catalog: 'styles', button: 'See styles', explore: 'All styles', topPicks: 'Popular styles', item: 'style', book: 'Sew this style' },
  'Fashion & tailoring': { catalog: 'styles', button: 'See styles', explore: 'All styles', topPicks: 'New & popular', item: 'style' },
  Repairs: { catalog: 'repairs and prices', button: 'See repairs', explore: 'All repairs', topPicks: 'Common repairs', item: 'repair', book: 'Book a repair' },
  'Phones & repairs': { catalog: 'phones, repairs and prices', button: 'See all', explore: 'Phones & repairs', topPicks: 'Popular right now', book: 'Book a repair' },
  Cleaning: { topPicks: 'Popular cleaning jobs', book: 'Book cleaning' },
  'Events & photography': { catalog: 'packages', button: 'See packages', explore: 'All packages', topPicks: 'Popular packages', item: 'package', book: 'Book package' },
  'Health & fitness': { catalog: 'sessions', button: 'See sessions', explore: 'All sessions', topPicks: 'Popular sessions', item: 'session', book: 'Book session' },
  Tutoring: { catalog: 'lessons', button: 'See lessons', explore: 'All lessons', topPicks: 'Popular lessons', item: 'lesson', book: 'Book lesson' },
  Fashion: { topPicks: 'New & popular' },
  'Beauty & cosmetics': { topPicks: 'Customer favourites' },
  'Phones & electronics': { topPicks: 'Hot deals' },
  Groceries: { topPicks: 'Popular items' },
  Pharmacy: { topPicks: 'Popular items' },
  'Bakery & pastries': { topPicks: 'Fresh today' },
  Drinks: { catalog: 'drinks menu', topPicks: 'Customer favourites', item: 'drink' },
};

export function vocabulary(type: BusinessType, category?: string | null): Words {
  return { ...(BY_TYPE[type] ?? BY_TYPE.retail), ...(category ? BY_CATEGORY[category] : undefined) };
}

export const FULFILMENT_LABEL: Record<Fulfilment, string> = {
  delivery: 'Delivery',
  pickup: 'Pickup',
  dine_in: 'Eat in',
  appointment: 'At the shop',
  on_site: 'At your place',
};

export function formatWhen(at: Date): string {
  return at.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' });
}

export function linesSummary(lines: Array<Pick<OrderLine, 'name' | 'quantity' | 'unitPriceMinor'>>, currency: Currency = 'GHS'): string {
  return lines.map((l, i) => `${i + 1}. ${l.quantity} × ${l.name}  ${formatMoney(l.unitPriceMinor * l.quantity, currency)}`).join('\n');
}

export interface StatusContext {
  number: number;
  businessType: BusinessType;
  fulfilment: Fulfilment;
  hasProducts: boolean;
  rider: { name: string; phone: string } | null;
  appointmentAt: Date | null;
  shopArea: string | null;
  reason: string | null;
}

/** The customer's WhatsApp update for each status change. null = say nothing. */
export function statusMessage(status: OrderStatus, c: StatusContext): string | null {
  const noun = c.hasProducts ? 'order' : vocabulary(c.businessType).order;
  const ref = `${noun[0].toUpperCase()}${noun.slice(1)} #${c.number}`;
  switch (status) {
    case 'confirmed':
      return c.appointmentAt ? `${ref} is confirmed for ${formatWhen(c.appointmentAt)}. See you then!` : `${ref} is confirmed. We're on it.`;
    case 'in_progress':
      if (!c.hasProducts) return null;
      return c.businessType === 'food' ? `${ref} is being prepared.` : null;
    case 'ready':
      return c.fulfilment === 'pickup' ? `${ref} is ready for pickup${c.shopArea ? ` at our shop in ${c.shopArea}` : ''}.` : null;
    case 'out_for_delivery':
      return [`${ref} is on its way to you.`, c.rider ? `Rider: ${c.rider.name} (${c.rider.phone})` : null].filter(Boolean).join('\n');
    case 'completed':
      if (c.fulfilment === 'delivery') return `${ref} has been delivered. Thank you!`;
      if (c.fulfilment === 'pickup') return `${ref} has been collected. Thank you!`;
      return `${ref} is complete. Thank you for choosing us!`;
    case 'cancelled':
      return `${ref} has been cancelled.${c.reason ? ` Reason: ${c.reason}.` : ''} Message us if this is a mistake.`;
    default:
      return null;
  }
}

export function paymentInstructions(totalMinor: number, momo: { mtn?: string | null; telecel?: string | null; airteltigo?: string | null; accountName?: string | null } | undefined, currency: Currency = 'GHS'): string {
  const lines = [
    momo?.mtn ? `MTN MoMo: ${momo.mtn}` : null,
    momo?.telecel ? `Telecel Cash: ${momo.telecel}` : null,
    momo?.airteltigo ? `AirtelTigo Money: ${momo.airteltigo}` : null,
  ].filter(Boolean);
  if (!lines.length) return 'We will message you here to confirm.';
  return [
    `To pay, send ${formatMoney(totalMinor, currency)} by mobile money to:`,
    ...lines,
    momo?.accountName ? `Name: ${momo.accountName}` : null,
    '',
    'Then reply here with the Transaction ID from your MoMo SMS.',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/** Same as the web's duration(): 90 → "90 min", 120 → "2 hours", 43200 → "1 month". */
export function formatDuration(minutes: number): string {
  const units: Array<[string, number]> = [['month', 43200], ['day', 1440], ['hour', 60]];
  const [name, size] = units.find(([, m]) => minutes % m === 0) ?? ['', 1];
  if (!name) return `${minutes} min`;
  const n = minutes / size;
  return `${n} ${name}${n === 1 ? '' : 's'}`;
}
