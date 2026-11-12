import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, className, id, children, ...rest },
  ref,
) {
  const generated = useId();
  const selectId = id ?? generated;

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink shadow-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10',
          error ? 'border-danger' : 'border-line2',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p className="text-xs font-medium text-danger">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
});
