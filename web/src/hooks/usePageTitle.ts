import { useEffect } from 'react';

/**
 * This is a client-rendered SPA (see README's "What is not built yet") —
 * index.html's <title> is the only thing a crawler that doesn't run JS ever
 * sees. This covers the ones that do (Google's does), and gives each
 * marketing route a distinct browser-tab title either way.
 */
export function usePageTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} — SellEazy`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
