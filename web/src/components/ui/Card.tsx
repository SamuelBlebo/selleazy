import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('overflow-hidden rounded-2xl border border-line bg-surface shadow-card', className)} {...rest} />;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...rest} />;
}
