import type { NextRequest } from 'next/server';

import { handleApi } from '@/lib/server/api-helpers';
import { buyCosmeticResultSchema, fetchCosmetic } from '@/lib/server/dto';
import { buyCosmeticSchema, type BuyCosmeticInput } from '@/lib/validations';
import type { BuyCosmeticResponse } from '@/types/api';

/**
 * POST /api/shop/buy — achat d'un cosmétique en chakra.
 * Débit, contrôle de solde ('INSUFFICIENT_CHAKRA' 409) et inventaire vivent
 * dans la RPC buy_cosmetic ; le handler complète la réponse avec le DTO
 * cosmétique (lecture publique).
 */
export async function POST(request: NextRequest) {
  return handleApi<BuyCosmeticInput>(request, {
    route: '/api/shop/buy',
    schema: buyCosmeticSchema,
    rateLimit: 'mutation',
    run: async ({ supabase, user }, input) => {
      const { data, error } = await supabase.rpc('buy_cosmetic', {
        p_user: user.id,
        p_cosmetic_id: input.cosmetic_id,
        p_idempotency_key: input.idempotency_key,
      });
      if (error) throw error;
      const r = buyCosmeticResultSchema.parse(data);
      const cosmetic = await fetchCosmetic(supabase, r.cosmetic_id);
      const body: BuyCosmeticResponse = { cosmetic, new_balance: r.new_balance };
      return { body };
    },
  });
}
