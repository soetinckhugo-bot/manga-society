import type { NextRequest } from 'next/server';

import { handleApi } from '@/lib/server/api-helpers';
import { asDto } from '@/lib/server/dto';
import type { GetAlbumResponse } from '@/types/api';

/**
 * GET /api/collection/album — mode album : tous les persos du pool, groupés
 * par anime, avec statut possédé / silhouette, compteurs et meilleur print.
 * Parcours unique de characters côté SQL (un seul RPC).
 */
export async function GET(request: NextRequest) {
  return handleApi(request, {
    route: '/api/collection/album',
    run: async ({ supabase, user }) => {
      const { data, error } = await supabase.rpc('get_album', { p_user: user.id });
      if (error) throw error;
      return { body: asDto<GetAlbumResponse>(data) };
    },
  });
}
