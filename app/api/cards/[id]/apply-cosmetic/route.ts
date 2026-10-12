import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiError, handleApi } from '@/lib/server/api-helpers';
import { applyCosmeticResultSchema, fetchCardDetail } from '@/lib/server/dto';
import { applyCosmeticSchema, type ApplyCosmeticInput } from '@/lib/validations';
import type { ApplyCosmeticResponse } from '@/types/api';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * POST /api/cards/:id/apply-cosmetic — applique un cosmétique possédé sur
 * une carte possédée (une seule instance par type par carte — la RPC gère
 * ownership, inventaire et slot). Le path et le corps portent tous deux
 * card_id : ils DOIVENT concorder (vérifié ici).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return handleApi<ApplyCosmeticInput>(request, {
    route: '/api/cards/[id]/apply-cosmetic',
    schema: applyCosmeticSchema,
    rateLimit: 'mutation',
    run: async ({ supabase, user }, input) => {
      const parsed = paramsSchema.safeParse({ id });
      if (!parsed.success || parsed.data.id !== input.card_id) {
        throw new ApiError('VALIDATION_ERROR');
      }
      const { data, error } = await supabase.rpc('apply_cosmetic', {
        p_user: user.id,
        p_card_id: input.card_id,
        p_cosmetic_id: input.cosmetic_id,
        p_idempotency_key: input.idempotency_key,
      });
      if (error) throw error;
      applyCosmeticResultSchema.parse(data);
      // Réponse contractuelle : la carte complète (relecture via la RPC de
      // détail — pas de recomposition partielle côté handler).
      const card = await fetchCardDetail(supabase, user.id, input.card_id);
      const body: ApplyCosmeticResponse = { card };
      return { body };
    },
  });
}
