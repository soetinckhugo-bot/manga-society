import type { NextRequest } from 'next/server';

import { handleApi } from '@/lib/server/api-helpers';
import { toOpenBoosterResponse } from '@/lib/server/dto';
import { openBoosterSchema, type OpenBoosterInput } from '@/lib/validations';

/**
 * POST /api/boosters/open — ouverture d'un booster gratuit à thème.
 * Pipeline : auth → Zod → rate limit (1 open / 2 s) → RPC open_booster
 * (idempotence par clé, recharge, pity, doré, prints atomiques — tout vit
 * en SQL) → mapping OpenBoosterResponse. Le handler ne calcule RIEN de
 * l'économie.
 */
export async function POST(request: NextRequest) {
  return handleApi<OpenBoosterInput>(request, {
    route: '/api/boosters/open',
    schema: openBoosterSchema,
    rateLimit: 'open',
    run: async ({ supabase, user }, input) => {
      // Borne basse capturée AVANT la RPC : sert au calcul serveur de
      // is_new_character (cartes obtenues strictement avant = déjà possédées).
      const obtainedBefore = new Date();
      const { data, error } = await supabase.rpc('open_booster', {
        p_user: user.id,
        p_theme_slug: input.theme_slug,
        p_idempotency_key: input.idempotency_key,
      });
      if (error) throw error;
      const body = await toOpenBoosterResponse(supabase, user.id, data, obtainedBefore);
      return { body };
    },
  });
}
