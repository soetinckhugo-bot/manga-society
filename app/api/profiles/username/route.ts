import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { handleApi } from '@/lib/server/api-helpers';
import { asDto } from '@/lib/server/dto';
import type { SetUsernameResponse } from '@/types/api';

const bodySchema = z.object({
  username: z.string().regex(/^[A-Za-z0-9_-]{3,20}$/),
});

/**
 * POST /api/profiles/username { username } — choix / modification du pseudo
 * (onboarding). 409 'USERNAME_TAKEN' (citext unique), 422 'INVALID_USERNAME'.
 */
export async function POST(request: NextRequest) {
  return handleApi(request, {
    route: '/api/profiles/username',
    schema: bodySchema,
    run: async ({ supabase, user }, { username }) => {
      const { data, error } = await supabase.rpc('set_username', {
        p_user: user.id,
        p_username: username,
      });
      if (error) throw error;
      return { body: asDto<SetUsernameResponse>(data) };
    },
  });
}
