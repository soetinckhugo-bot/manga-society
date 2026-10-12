'use client';

import { useQuery } from '@tanstack/react-query';

import {
  boosterStateQueryKey,
  getBoosterState,
} from '@/lib/query/api';

/**
 * Abonnés partagés à GET /api/boosters/state (clé unique → une seule
 * requête réseau pour toutes les sections). La state-bar porte le polling
 * 30 s ; les widgets restent passifs et se mettent à jour via le cache
 * partagé + invalidateQueries après chaque mutation.
 */

const POLL_INTERVAL_MS = 30_000;

/** Observer actif : polling serveur toutes les 30 s (staleTime déjà 30 s). */
export function useBoosterStatePolling() {
  return useQuery({
    queryKey: boosterStateQueryKey,
    queryFn: getBoosterState,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/** Observer passif : lit le cache partagé, se resync via invalidations. */
export function useBoosterState() {
  return useQuery({
    queryKey: boosterStateQueryKey,
    queryFn: getBoosterState,
  });
}
