import type { NextRequest } from 'next/server';

import { handleApi } from '@/lib/server/api-helpers';
import { claimQuestsResultSchema } from '@/lib/server/dto';
import { claimQuestsSchema, type ClaimQuestsInput } from '@/lib/validations';
import type { ClaimQuestsResponse } from '@/types/api';

/**
 * POST /api/quests/claim — réclamation des quêtes complétées du jour
 * (crédit chakra). Idempotente par construction côté SQL (re-claim le même
 * jour = no-op) ; la clé d'idempotence du corps est acceptée au contrat
 * mais la RPC n'en a pas besoin (cf. HANDOFF.md).
 */
export async function POST(request: NextRequest) {
  return handleApi<ClaimQuestsInput>(request, {
    route: '/api/quests/claim',
    schema: claimQuestsSchema,
    rateLimit: 'mutation',
    run: async ({ supabase, user }, input) => {
      const { data, error } = await supabase.rpc('claim_quests', {
        p_user: user.id,
        p_quest_ids: input.quest_ids,
      });
      if (error) throw error;
      const r = claimQuestsResultSchema.parse(data);
      const body: ClaimQuestsResponse = {
        chakra_gained: r.chakra_gained,
        new_balance: r.new_balance,
        claimed_quest_ids: r.claimed,
      };
      return { body };
    },
  });
}
