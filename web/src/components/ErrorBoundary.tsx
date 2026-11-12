import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { reportError } from '@/utils/monitoring';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * The last line of defense against a render-time bug taking down the whole
 * app to a white screen. React error boundaries must be class components —
 * there is no hook equivalent. Catches render/lifecycle errors in the
 * subtree below it; it does not catch errors from event handlers or async
 * code (those already go through each call site's own try/catch).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Unhandled render error', error, info.componentStack);
    reportError(error, { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
          <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted">
            This page hit an unexpected error. Reloading usually fixes it — if it keeps happening, let us know.
          </p>
          <Button className="mt-5" fullWidth onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    );
  }
}
