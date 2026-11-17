import { getAnalytics, isSupported, logEvent, type Analytics } from 'firebase/analytics';
import { app } from '@/firebase/config';
import { env } from './env';

/**
 * Product/usage analytics for the app itself (page views) — distinct from
 * the merchant-facing revenue analytics on /analytics. No-ops entirely with
 * no `VITE_FIREBASE_MEASUREMENT_ID` set, same pattern as monitoring.ts.
 * `isSupported()` is async (checks for browser APIs Analytics needs), so
 * `ready` may still be pending for the very first trackPageView call — an
 * accepted gap, not worth synchronizing app startup around.
 */
let analytics: Analytics | null = null;
let ready: Promise<void> | null = null;

export function initAnalytics(): void {
  if (!env.measurementId || ready) return;
  ready = isSupported().then((supported) => {
    if (supported) analytics = getAnalytics(app);
  });
}

export async function trackPageView(path: string): Promise<void> {
  if (!env.measurementId || !ready) return;
  await ready;
  if (analytics) logEvent(analytics, 'page_view', { page_path: path });
}

/**
 * Setup wizard funnel: which step a merchant finished or put off, so we can
 * see where people drop off. Step ids only, never names, numbers or prices.
 */
export async function trackSetupStep(step: string, outcome: 'done' | 'later'): Promise<void> {
  if (!env.measurementId || !ready) return;
  await ready;
  if (analytics) logEvent(analytics, 'setup_step', { step, outcome });
}
