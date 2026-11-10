import { Link } from 'react-router-dom';
import { cn } from '@/utils/cn';

/** SellEazy's mark: a speech bubble with the selvedge's double rule. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M5 5h22a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H14l-7 5v-5H5a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="#C4860F" />
      <path d="M8 12h16M8 15.5h16M8 19h9" stroke="#1C2757" strokeWidth="1.6" />
    </svg>
  );
}

export function Logo({ to = '/', className, light }: { to?: string; className?: string; light?: boolean }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2.5', light ? 'text-brand-on' : 'text-ink', className)}>
      <Mark />
      <span className="font-cap text-2xl font-bold leading-none tracking-wide">SellEazy</span>
    </Link>
  );
}
