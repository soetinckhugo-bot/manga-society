import type { NextRequest } from 'next/server';

import { GAME_CONFIG } from '@/lib/config';
import { handleApi } from '@/lib/server/api-helpers';
import {
  fetchCharacterWishlistCount,
  toggleWishlistResultSchema,
} from '@/lib/server/dto';
import { wishlistToggleSchema, type WishlistToggleInput } from '@/lib/validations';
import type { ToggleWishlistResponse } from '@/types/api';

/**
 * POST /api/wishlist/toggle — ajoute/retire un perso de la wishlist.
 * Naturellement idempotent (toggle déterministe, pas de clé requise au
 * contrat). Cap 10 slots ('WISHLIST_FULL' 409) géré par la RPC.
 *
 * La RPC renvoie le compteur de SLOTS du joueur ; le compteur public du
 * perso (valeur de burn) est relu ici côté serveur.
 */
export async function POST(request: NextRequest) {
  return handleApi<WishlistToggleInput>(request, {
    route: '/api/wishlist/toggle',
    schema: wishlistToggleSchema,
    rateLimit: 'mutation',
    run: async ({ supabase, user }, input) => {
      const { data, error } = await supabase.rpc('toggle_wishlist', {
        p_user: user.id,
        p_character_id: input.character_id,
      });
      if (error) throw error;
      const r = toggleWishlistResultSchema.parse(data);
      const characterWishlistCount = await fetchCharacterWishlistCount(
        supabase,
        input.character_id,
      );
      const body: ToggleWishlistResponse = {
        added: r.in_wishlist,
        wishlist_count: characterWishlistCount,
        slots_used: r.wishlist_count,
        slots_max: GAME_CONFIG.wishlist.maxSlots,
      };
      return { body };
    },
  });
}
