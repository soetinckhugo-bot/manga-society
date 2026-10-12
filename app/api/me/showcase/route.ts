import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { handleApi } from '@/lib/server/api-helpers';
import { asDto } from '@/lib/server/dto';
import type { SetShowcaseResponse } from '@/types/api';

const bodySchema = z.object({
  card_ids: z.array(z.string().uuid()).max(5),
});

/**
 * POST /api/me/showcase { card_ids: uuid[] } — vitrine publique (≤ 5 cartes
 * possédées, ordre préservé). Renvoie la vitrine complète (CardDto).
 * 400 'VALIDATION_ERROR' (> 5), 409 'NOT_OWNER', 404 'CARD_NOT_FOUND'.
 */
export async function POST(request: NextRequest) {
  return handleApi(request, {
    route: '/api/me/showcase',
    schema: bodySchema,
    run: async ({ supabase, user }, { card_ids }) => {
      const { data, error } = await supabase.rpc('set_showcase', {
        p_user: user.id,
        p_card_ids: card_ids,
      });
      if (error) throw error;
      return { body: asDto<SetShowcaseResponse>(data) };
    },
  });
}
