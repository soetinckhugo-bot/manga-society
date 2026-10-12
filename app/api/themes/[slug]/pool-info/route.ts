import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiError, handleApi } from '@/lib/server/api-helpers';
import { asDto } from '@/lib/server/dto';
import type { GetThemePoolInfoResponse } from '@/types/api';

const paramsSchema = z.object({ slug: z.string().min(1).max(64) });

/**
 * GET /api/themes/:slug/pool-info — contenu d'un thème : nb de persos par
 * rareté + nb d'envies du joueur présentes dans le pool ("X de tes envies
 * dans ce booster"). Un seul RPC ; 'THEME_NOT_FOUND' (404) si slug inconnu.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  return handleApi(request, {
    route: '/api/themes/[slug]/pool-info',
    run: async ({ supabase, user }) => {
      const parsed = paramsSchema.safeParse({ slug });
      if (!parsed.success) throw new ApiError('VALIDATION_ERROR');
      const { data, error } = await supabase.rpc('get_theme_pool_info', {
        p_user: user.id,
        p_slug: parsed.data.slug,
      });
      if (error) throw error;
      return { body: asDto<GetThemePoolInfoResponse>(data) };
    },
  });
}
