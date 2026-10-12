import type { NextRequest } from 'next/server';

import { handleApi } from '@/lib/server/api-helpers';
import { toOpenPremiumBoosterResponse } from '@/lib/server/dto';
import {
  openPremiumBoosterSchema,
  type OpenPremiumBoosterInput,
} from '@/lib/validations';

/**
 * POST /api/boosters/open-premium — 10 points premium, 1 carte Légendaire
 * minimum (roll 85% L / 15% M côté RPC, priorité pity M > pity L).
 * 'NOT_ENOUGH_POINTS' si solde insuffisant (409).
 */
export async function POST(request: NextRequest) {
  return handleApi<OpenPremiumBoosterInput>(request, {
    route: '/api/boosters/open-premium',
    schema: openPremiumBoosterSchema,
    rateLimit: 'open',
    run: async ({ supabase, user }, input) => {
      const obtainedBefore = new Date();
      const { data, error } = await supabase.rpc('open_premium_booster', {
        p_user: user.id,
        p_idempotency_key: input.idempotency_key,
      });
      if (error) throw error;
      const body = await toOpenPremiumBoosterResponse(supabase, user.id, data, obtainedBefore);
      return { body };
    },
  });
}
