import type { Timestamp } from 'firebase/firestore';

type DateLike = Timestamp | Date | null | undefined;
const toDate = (v: DateLike) => (!v ? null : v instanceof Date ? v : v.toDate());

/** Pesewas → "GH₵ 1,240.00". All money in SellEazy is integer pesewas. */
export function cedis(minor: number | null | undefined): string {
  return `GH₵ ${((minor ?? 0) / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
