import type { Timestamp } from 'firebase/firestore';

type DateLike = Timestamp | Date | null | undefined;
const toDate = (v: DateLike) => (!v ? null : v instanceof Date ? v : v.toDate());

/** Currencies a business can sell in. All use 2 decimals, so money stays integer minor units (pesewas, kobo, cents). */
export const CURRENCIES = [
  { code: 'GHS', symbol: 'GH₵', label: 'Ghana cedi (GH₵)' },
  { code: 'NGN', symbol: '₦', label: 'Nigerian naira (₦)' },
  { code: 'USD', symbol: '$', label: 'US dollar ($)' },
  { code: 'GBP', symbol: '£', label: 'British pound (£)' },
  { code: 'EUR', symbol: '€', label: 'Euro (€)' },
  { code: 'KES', symbol: 'KSh', label: 'Kenyan shilling (KSh)' },
  { code: 'ZAR', symbol: 'R', label: 'South African rand (R)' },
] as const;
export type Currency = (typeof CURRENCIES)[number]['code'];

/** The signed-in business's currency; DashboardLayout sets it so every page formats the same way. */
let activeCurrency: Currency = 'GHS';
export const setMoneyCurrency = (c: Currency | undefined) => { activeCurrency = c ?? 'GHS'; };
export const currencySymbol = (c: Currency = activeCurrency) => CURRENCIES.find((x) => x.code === c)?.symbol ?? c;

/** Minor units → "GH₵ 1,240.00" (or the business's currency). */
export function money(minor: number | null | undefined, currency: Currency = activeCurrency): string {
  return `${currencySymbol(currency)} ${((minor ?? 0) / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "45" or "45.50" typed by a merchant → pesewas. NaN → null. */
export function toMinor(cedisText: string | number): number | null {
  const n = typeof cedisText === 'number' ? cedisText : Number(String(cedisText).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function time(v: DateLike): string {
  const d = toDate(v);
  return d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
}

/** "13:04" today, "Yesterday", "Sat 7 Nov" otherwise. */
export function shortWhen(v: DateLike): string {
  const d = toDate(v);
  if (!d) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d >= today) return time(d);
  if (d >= new Date(today.getTime() - 86400000)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDate(v: DateLike): string {
  const d = toDate(v);
  return d ? d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

export function toDatetimeLocalInput(v: DateLike): string {
  const d = toDate(v);
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** "+233244118802" → "+233 24 411 8802". */
export function formatPhone(p: string | null | undefined): string {
  const d = (p ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('233')) return `+233 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return p ?? '';
}

export function initials(name: string | null | undefined): string {
  return (name ?? '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

/** Service lengths are stored in minutes; merchants pick a unit. A month counts as 30 days. */
export const DURATION_UNITS = [
  { value: 'minutes', label: 'Minutes', minutes: 1 },
  { value: 'hours', label: 'Hours', minutes: 60 },
  { value: 'days', label: 'Days', minutes: 1440 },
  { value: 'months', label: 'Months', minutes: 43200 },
] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number]['value'];

/** 4320 → { amount: 3, unit: 'days' }: the largest unit that divides evenly. */
export function splitDuration(minutes: number): { amount: number; unit: DurationUnit } {
  const u = [...DURATION_UNITS].reverse().find((d) => minutes % d.minutes === 0) ?? DURATION_UNITS[0];
  return { amount: minutes / u.minutes, unit: u.value };
}

/** 90 → "90 min", 120 → "2 hours", 1440 → "1 day", 86400 → "2 months". */
export function duration(minutes: number): string {
  const { amount, unit } = splitDuration(minutes);
  if (unit === 'minutes') return `${amount} min`;
  return `${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`;
}
