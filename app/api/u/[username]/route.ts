import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiError, handleApi } from '@/lib/server/api-helpers';
import { asDto } from '@/lib/server/dto';
import type { GetPublicProfileResponse } from '@/types/api';

const paramsSchema = z.object({
  username: z.string().regex(/^[A-Za-z0-9_-]{3,20}$/),
});

/**
 * GET /api/u/[username] — profil public (page /u/[username], SPEC §3 :
 * stats, % collection, meilleur print, plus haute rareté, streak, vitrine,
 * wishlist publique). Route PUBLIQUE. 404 'PROFILE_NOT_FOUND' si inconnu.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  // params est une Promise (Next 15+) — résolu avant d'entrer dans le wrapper.
  const { username } = await params;

  return handleApi(request, {
    route: '/api/u/[username]',
    auth: 'public',
    run: async ({ supabase }) => {
      const parsed = paramsSchema.safeParse({ username });
      if (!parsed.success) throw new ApiError('PROFILE_NOT_FOUND');
      const { data, error } = await supabase.rpc('get_public_profile', {
        p_username: parsed.data.username,
      });
      if (error) throw error;
      return { body: asDto<GetPublicProfileResponse>(data) };
    },
  });
}
