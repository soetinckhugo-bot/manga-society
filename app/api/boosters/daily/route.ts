import type { NextRequest } from 'next/server';

import { handleApi } from '@/lib/server/api-helpers';
import { toClaimDailyPackResponse } from '@/lib/server/dto';
import {
  claimDailyPackSchema,
  type ClaimDailyPackInput,
} from '@/lib/validations';

/**
 * POST /api/boosters/daily — pack du jour : gratuit, 1/jour (minuit
 * Europe/Paris), thème rotatif déterministe, 5 cartes Épique minimum.
 * 'ALREADY_CLAIMED' (409) si déjà pris aujourd'hui ; la réponse porte
 * next_reset_at calculé côté serveur (jamais l'horloge client).
 */
export async function POST(request: NextRequest) {
  return handleApi<ClaimDailyPackInput>(request, {
    route: '/api/boosters/daily',
    schema: claimDailyPackSchema,
    rateLimit: 'mutation',
    run: async ({ supabase, user }, input) => {
      const obtainedBefore = new Date();
      const { data, error } = await supabase.rpc('claim_daily_pack', {
        p_user: user.id,
        p_idempotency_key: input.idempotency_key,
      });
      if (error) throw error;
      const body = await toClaimDailyPackResponse(supabase, user.id, data, obtainedBefore);
      return { body };
    },
  });
}
