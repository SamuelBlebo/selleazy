import type { BusinessType, Fulfilment, OrderLine, OrderStatus } from '../domain/model';
import { formatMoney, type Currency } from '../domain/money';

/** Words that change with what the merchant sells. */
export function vocabulary(type: BusinessType) {
  switch (type) {
    case 'food':
      return { catalog: 'menu', button: 'View menu', order: 'order' };
    case 'services':
      return { catalog: 'services', button: 'See services', order: 'booking' };
    default:
      return { catalog: 'catalogue', button: 'See items', order: 'order' };
  }
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
