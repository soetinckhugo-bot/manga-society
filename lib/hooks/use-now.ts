'use client';

import { useSyncExternalStore } from 'react';

/**
 * lib/hooks/use-now.ts — horloge client en secondes, tick 1 s.
 *
 * Contraintes Next 16 `cacheComponents` respectées :
 * - getServerSnapshot renvoie 0 : aucun `Date.now()` pendant le prerender
 *   (le snapshot serveur est stable, le client se resync à l'hydratation) ;
 * - `useSyncExternalStore` (et non setState dans un effet) : conforme à la
 *   règle react-hooks/set-state-in-effect.
 *
 * Usage : décomptes COSMÉTIQUES uniquement (recharge, reset quotidien) —
 * la vérité d'économie reste le state serveur (SPEC §7).
 */
export function useNowSeconds(): number {
  return useSyncExternalStore(
    subscribeTick,
    getClientSnapshot,
    getServerSnapshot,
  );
}

function subscribeTick(onStoreChange: () => void): () => void {
  const interval = setInterval(onStoreChange, 1000);
  return () => clearInterval(interval);
}

function getClientSnapshot(): number {
  return Math.floor(Date.now() / 1000);
}

function getServerSnapshot(): number {
  return 0;
}
