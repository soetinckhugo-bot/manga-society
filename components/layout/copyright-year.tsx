'use client';

import { useSyncExternalStore } from 'react';

/**
 * Année du copyright. `new Date()` est interdit pendant le prerender
 * (cacheComponents) : le snapshot serveur vaut 0, le client fournit l'année
 * réelle via useSyncExternalStore (aucun setState dans un effet).
 */
export function CopyrightYear() {
  const year = useSyncExternalStore(noopSubscribe, getYear, getServerYear);

  return <span suppressHydrationWarning>{year === 0 ? '' : year}</span>;
}

function noopSubscribe(): () => void {
  return () => {};
}

function getYear(): number {
  return new Date().getFullYear();
}

function getServerYear(): number {
  return 0;
}
