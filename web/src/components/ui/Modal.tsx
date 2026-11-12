import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const dialog = dialogRef.current;
    dialog?.focus();
    dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // A basic focus trap: Tab from the last control wraps to the first
      // (and back), so focus can never escape into the page behind the modal.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Hand focus back to whatever opened the dialog — a sighted mouse user
      // won't notice, but a keyboard/screen-reader user would otherwise land
      // back at the top of the page.
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-ink/30 p-4 outline-none"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[88vh] w-full max-w-lg overflow-auto rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </Button>
        </div>
        <div className="p-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
