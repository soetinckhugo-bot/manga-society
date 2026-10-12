import { useMemo } from 'react';

import { useNowSeconds } from './use-now';

/**
 * lib/hooks/use-booster-timer.ts — décompte de recharge, PUREMENT COSMÉTIQUE.
 *
 * Affiche le temps restant avant la prochaine recharge de stock et la
 * progression de la tranche courante. NE DECIDE RIEN : la vérité d'économie
 * (stock, recharge due) reste côté serveur (RPC) et se resynchronise via le
 * polling React Query de GET /api/boosters/state (SPEC §7). Entre deux polls,
 * ce hook fournit simplement un décompte smooth.
 *
 * @param nextRechargeAt ISO 8601 du prochain rechargement, null si stock plein
 * @param intervalMinutes durée d'une tranche de recharge (affichage uniquement)
 */

export interface BoosterTimerState {
  /** Secondes restantes avant la prochaine recharge (0 si null/full). */
  secondsLeft: number;
  /** Progression 0 → 1 de la tranche écoulée. */
  progress: number;
}

export function useBoosterTimer(
  nextRechargeAt: string | null,
  intervalMinutes: number,
): BoosterTimerState {
  const intervalSeconds = Math.max(intervalMinutes, 1) * 60;
  const nowSeconds = useNowSeconds();

  const target = useMemo(
    () => (nextRechargeAt ? new Date(nextRechargeAt).getTime() : null),
    [nextRechargeAt],
  );

  // Dérivé directement pendant le render à partir de l'horloge externe
  // (useSyncExternalStore) : aucun état, aucun effet.
  if (target === null || Number.isNaN(target)) {
    return { secondsLeft: 0, progress: 0 };
  }

  // nowSeconds === 0 : snapshot serveur / tout premier render — on affiche 0
  // (le client se resync à l'hydratation, délai d'une frame au plus).
  const remainingMs =
    nowSeconds === 0 ? 0 : Math.max(target - nowSeconds * 1000, 0);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const elapsed = Math.max(intervalSeconds - secondsLeft, 0);

  return {
    secondsLeft,
    progress: Math.min(elapsed / intervalSeconds, 1),
  };
}
