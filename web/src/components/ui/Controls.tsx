import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { Icon } from './Icon';

/** On/off switch. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        'relative h-[26px] w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-ok' : 'bg-line2',
      )}
    >
      <span className={cn('absolute left-[3px] top-[3px] h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-[18px]')} />
    </button>
  );
}

/** Segmented tabs (filters). Scrolls sideways on phones. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; count?: number }>;
}) {
  return (
    <div role="tablist" className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-raised p-1 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium',
            value === o.value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="tabular ml-1.5 text-muted">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block w-full sm:max-w-xs">
      <span className="sr-only">{placeholder}</span>
      <Icon name="search" className="pointer-events-none absolute left-3 top-2 text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-line2 bg-white pl-10 pr-4 text-sm shadow-sm placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10"
      />
    </label>
  );
}

/** Right-hand panel for details and forms. Full width on phones. */
export function Drawer({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 animate-fade-in bg-ink/30" onClick={onClose} />
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] animate-slide-in flex-col bg-surface shadow-pop outline-none border-l border-line"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3.5">
          <h2 className="truncate text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink">
            <Icon name="x" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface px-5 py-3">{footer}</div>}
      </aside>
    </>
  );
}

/** A labelled row with a control on the right (settings). */
export function SettingRow({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-5 border-t border-line py-3.5 first:border-t-0">
      <div>
        <p className="font-medium">{title}</p>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function Textarea({ label, hint, className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="block text-sm font-medium">{label}</span>}
      <textarea
        className={cn('min-h-[84px] w-full rounded-lg border border-line2 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10', className)}
        {...rest}
      />
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}
