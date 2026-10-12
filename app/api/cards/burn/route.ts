import type { NextRequest } from 'next/server';

import { handleApi } from '@/lib/server/api-helpers';
import { burnResultSchema } from '@/lib/server/dto';
import { burnCardSchema, type BurnInput } from '@/lib/validations';
import type { BurnCardResponse } from '@/types/api';

/**
 * POST /api/cards/burn — brûler une carte doublon contre du chakra.
 * Ownership, suppression, crédit (base rareté × demande wishlist) et
 * progression quêtes vivent ENTIÈREMENT dans la RPC burn_card.
 * 'NOT_OWNER' (409) si la carte n'appartient pas au joueur.
 */
export async function POST(request: NextRequest) {
  return handleApi<BurnInput>(request, {
    route: '/api/cards/burn',
    schema: burnCardSchema,
    rateLimit: 'mutation',
    run: async ({ supabase, user }, input) => {
      const { data, error } = await supabase.rpc('burn_card', {
        p_user: user.id,
        p_card_id: input.card_id,
        p_idempotency_key: input.idempotency_key,
      });
      if (error) throw error;
      const r = burnResultSchema.parse(data);
      const body: BurnCardResponse = {
        chakra_gained: r.chakra_gained,
        new_balance: r.new_balance,
      };
      return { body };
    },
  });
}
