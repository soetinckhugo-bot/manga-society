import type { NextRequest } from 'next/server';

import { handleApi } from '@/lib/server/api-helpers';
import { asDto } from '@/lib/server/dto';
import type { GetWishlistResponse } from '@/types/api';

/**
 * GET /api/wishlist — wishlist du joueur + compteur de slots (cap 10).
 */
export async function GET(request: NextRequest) {
  return handleApi(request, {
    route: '/api/wishlist',
    run: async ({ supabase, user }) => {
      const { data, error } = await supabase.rpc('get_wishlist', { p_user: user.id });
      if (error) throw error;
      return { body: asDto<GetWishlistResponse>(data) };
    },
  });
}
