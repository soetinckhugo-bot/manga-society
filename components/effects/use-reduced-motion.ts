'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

/**
 * `prefers-reduced-motion` en hook — snapshot serveur `false` (rendu normal,
 * les animations sobres sont arrêtées côté client après hydratation).
 * useSyncExternalStore : compatible cacheComponents (pas de setState en effet).
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
