import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { handleApi } from '@/lib/server/api-helpers';
import { asDto } from '@/lib/server/dto';
import type { CheckUsernameResponse } from '@/types/api';

const querySchema = z.object({
  username: z.string().min(1).max(64),
});

/**
 * GET /api/profiles/check-username?username=… — disponibilité temps réel
 * pour l'onboarding (debounce côté client). Route PUBLIQUE (aucune donnée
 * sensible : seule la disponibilité d'un pseudo). La validation du FORMAT
 * est renvoyée sous reason 'invalid' (pas 400) pour que le client puisse
 * distinguer sans casser son debounce.
 */
export async function GET(request: NextRequest) {
  return handleApi(request, {
    route: '/api/profiles/check-username',
    schema: querySchema,
    parseFrom: 'query',
    auth: 'public',
    run: async ({ supabase }, { username }) => {
      const { data, error } = await supabase.rpc('check_username', {
        p_username: username,
      });
      if (error) throw error;
      return { body: asDto<CheckUsernameResponse>(data) };
    },
  });
}
