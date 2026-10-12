import type { NextRequest } from 'next/server';

import { handleApi } from '@/lib/server/api-helpers';
import { toLoginStreakResponse } from '@/lib/server/dto';

/**
 * POST /api/me/login-streak — hook de login appelé depuis /auth/callback
 * (Agent B) après création/refresh de session. Idempotent par construction
 * (même jour = no-op côté RPC) : appels multiples sans effet.
 */
export async function POST(request: NextRequest) {
  return handleApi(request, {
    route: '/api/me/login-streak',
    rateLimit: 'mutation',
    run: async ({ supabase, user }) => {
      const { data, error } = await supabase.rpc('update_login_streak', {
        p_user: user.id,
      });
      if (error) throw error;
      return { body: toLoginStreakResponse(data) };
    },
  });
}
