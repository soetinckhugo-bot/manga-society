import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { ApiError, handleApi } from '@/lib/server/api-helpers';
import {
  fetchCardDetail,
  fetchCosmetic,
  rerollCosmeticResultSchema,
} from '@/lib/server/dto';
import { rerollCosmeticSchema, type RerollCosmeticInput } from '@/lib/validations';
import type { RerollCosmeticResponse } from '@/types/api';

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * POST /api/cards/:id/reroll-cosmetic — brûle le cosmétique du slot sur la
 * carte et en crédite un autre du même type (randomness 100 % serveur),
 * moyennant du chakra ('INSUFFICIENT_CHAKRA' sinon).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  return handleApi<RerollCosmeticInput>(request, {
    route: '/api/cards/[id]/reroll-cosmetic',
    schema: rerollCosmeticSchema,
    rateLimit: 'mutation',
    run: async ({ supabase, user }, input) => {
      const parsed = paramsSchema.safeParse({ id });
      if (!parsed.success || parsed.data.id !== input.card_id) {
        throw new ApiError('VALIDATION_ERROR');
      }
      const { data, error } = await supabase.rpc('reroll_cosmetic', {
        p_user: user.id,
        p_card_id: input.card_id,
        p_cosmetic_type: input.slot,
        p_idempotency_key: input.idempotency_key,
      });
      if (error) throw error;
      const r = rerollCosmeticResultSchema.parse(data);
      const [card, newCosmetic] = await Promise.all([
        fetchCardDetail(supabase, user.id, input.card_id),
        fetchCosmetic(supabase, r.new_cosmetic),
      ]);
      const body: RerollCosmeticResponse = {
        card,
        new_cosmetic: newCosmetic,
        new_balance: r.new_balance,
      };
      return { body };
    },
  });
}
