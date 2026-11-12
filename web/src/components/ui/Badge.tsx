import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type Tone = 'neutral' | 'accent' | 'brand' | 'ok' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-raised text-muted',
  accent: 'bg-accent-soft text-accent-ink',
  brand: 'bg-brand-soft text-brand-ink',
  ok: 'bg-ok-soft text-ok-ink',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn('inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium', TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Small ochre count, used in navigation. */
export function Count({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn('tabular grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white', className)}>
      {n > 99 ? '99+' : n}
    </span>
  );
}
