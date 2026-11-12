import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

/** SellEazy's mark: a chat bubble on a WhatsApp-green tile. Same shape as the favicon in index.html. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#25D366" />
      <path d="M9 9h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 3.5V21H9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn('text-lg font-semibold leading-none tracking-tight', className)}>SellEazy</span>;
}

export function Logo({ to = '/', className, light }: { to?: string; className?: string; light?: boolean }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2', light ? 'text-white' : 'text-ink', className)}>
      <Mark size={26} />
      <Wordmark />
    </Link>
  );
}
