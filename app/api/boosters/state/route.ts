import type { NextRequest } from 'next/server';

import { handleApi } from '@/lib/server/api-helpers';
import { asDto } from '@/lib/server/dto';
import type { GetBoosterStateResponse } from '@/types/api';

/**
 * GET /api/boosters/state — état complet du panneau boosters, en UN SEUL
 * RPC (aucun N+1). Conçu pour le polling client toutes les 30 s
 * (React Query, staleTime 30 s) — doit rester solide sous charge.
 *
 * Tout est calculé côté serveur : recharge (next_recharge_at), pity
 * restants, doré, disponibilité du pack du jour, widget quêtes, streak.
 * Le client affiche et resynchronise, jamais l'inverse.
 */
export async function GET(request: NextRequest) {
  return handleApi(request, {
    route: '/api/boosters/state',
    run: async ({ supabase, user }) => {
      const { data, error } = await supabase.rpc('get_booster_state', {
        p_user: user.id,
      });
      if (error) throw error;
      // Forme produite par la RPC de lecture 0003 (voir MIGRATIONS.md).
      return { body: asDto<GetBoosterStateResponse>(data) };
    },
  });
}
