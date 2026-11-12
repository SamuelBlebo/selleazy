import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';

export function NotFoundPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-6 text-center">
      <div>
        <p className="text-sm font-semibold text-brand">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          That page is not here
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          The link may be old, or the page may have moved.
        </p>
        <Link to="/" className="mt-6 inline-block">
          <Button>Back to home</Button>
        </Link>
      </div>
    </div>
  );
}
