import type { NextRequest } from 'next/server';

import { handleApi } from '@/lib/server/api-helpers';
import { asDto } from '@/lib/server/dto';
import type { GetQuestsResponse } from '@/types/api';

/**
 * GET /api/quests — les 3 quêtes du jour + prochain minuit Europe/Paris.
 * La RPC génère les quêtes du jour si première action (no-op ensuite,
 * idempotence par jour en base).
 */
export async function GET(request: NextRequest) {
  return handleApi(request, {
    route: '/api/quests',
    run: async ({ supabase, user }) => {
      const { data, error } = await supabase.rpc('get_daily_quests', {
        p_user: user.id,
      });
      if (error) throw error;
      return { body: asDto<GetQuestsResponse>(data) };
    },
  });
}
