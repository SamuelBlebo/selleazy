/** All money is integer pesewas. These are the only conversions. */
export const toMinor = (cedis: number) => Math.round(cedis * 100);

/** A business's selling currency (organizations.currency). All have 2 decimals. Mirrors web/src/utils/format.ts. */
export type Currency = 'GHS' | 'NGN' | 'USD' | 'GBP' | 'EUR' | 'KES' | 'ZAR';

const SYMBOL: Record<Currency, string> = { GHS: 'GH₵', NGN: '₦', USD: '$', GBP: '£', EUR: '€', KES: 'KSh', ZAR: 'R' };

/** How customers write each currency, as a regex fragment. */
const WRITTEN: Record<Currency, string> = {
  GHS: 'gh[s₵c]|₵|cedis?',
  NGN: 'ngn|₦|naira',
  USD: String.raw`usd|\$|dollars?`,
  GBP: 'gbp|£|pounds?',
  EUR: 'eur|€|euros?',
  KES: 'kes|ksh|shillings?',
  ZAR: 'zar|rands?',
};

export function formatMoney(minor: number, currency: Currency = 'GHS'): string {
  return `${SYMBOL[currency] ?? currency} ${(minor / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Reads an amount out of a customer's message: "paid 50 cedis", "GHS 45.50",
 * "₵100", "₦5000". Returns minor units, or null if none found.
 */
export function parseAmount(text: string, currency: Currency = 'GHS'): number | null {
  const w = WRITTEN[currency] ?? WRITTEN.GHS;
  const m =
    text.match(new RegExp(String.raw`(?:${w})\s*([0-9]+(?:[.,][0-9]{1,2})?)`, 'i')) ??
    text.match(new RegExp(String.raw`([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:${w})`, 'i'));
  if (!m) return null;
  const value = Number(m[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? toMinor(value) : null;
}
