import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiError, handleApi } from '@/lib/server/api-helpers';
import { asDto } from '@/lib/server/dto';
import type { GetCardResponse } from '@/types/api';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * GET /api/cards/:id — détail d'une carte possédée + nombre de joueurs
 * possédant ce perso (count distinct agrégé, indexé — un seul RPC).
 * 404 'CARD_NOT_FOUND' si la carte est introuvable ou non possédée.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // params est une Promise (Next 15+) — résolu avant d'entrer dans le wrapper.
  const { id } = await params;

  return handleApi(request, {
    route: '/api/cards/[id]',
    run: async ({ supabase, user }) => {
      const parsed = paramsSchema.safeParse({ id });
      if (!parsed.success) throw new ApiError('VALIDATION_ERROR');
      const { data, error } = await supabase.rpc('get_card_detail', {
        p_user: user.id,
        p_card_id: parsed.data.id,
      });
      if (error) throw error;
      return { body: asDto<GetCardResponse>(data) };
    },
  });
}
