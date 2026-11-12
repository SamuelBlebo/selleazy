import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, id, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={cn(
          'w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink shadow-sm transition-shadow',
          'placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10',
          error ? 'border-danger' : 'border-line2',
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
});
