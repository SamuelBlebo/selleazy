import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 md:mb-6 md:items-end md:gap-4">
      <div>
        <h1 className="text-xl font-semibold leading-tight tracking-tight md:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted max-md:hidden">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
