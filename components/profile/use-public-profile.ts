'use client';

import { useQuery } from '@tanstack/react-query';

import { isAppErrorCode, type AppErrorCode } from '@/lib/errors';
import { ApiError } from '@/lib/query/api';
import type { PublicProfileDto } from '@/types/api';

/**
 * use-public-profile.ts — Fetch typé du profil public.
 *
 * `GET /api/u/[username]` est un endpoint PROVISOIRE (pas encore dans
 * types/api.ts côté client, à implémenter par l'Agent A — cf. HANDOFF.md) :
 * le corps de réponse attendu est PublicProfileDto, les erreurs suivent le
 * standard `{ error: AppErrorCode }`.
 */
export async function fetchPublicProfile(
  username: string,
): Promise<PublicProfileDto> {
  const response = await fetch(`/api/u/${encodeURIComponent(username)}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    let code: AppErrorCode = 'INTERNAL_ERROR';
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === 'string' && isAppErrorCode(body.error)) {
        code = body.error;
      }
    } catch {
      // Corps illisible : INTERNAL_ERROR par défaut.
    }
    throw new ApiError(code, response.status);
  }
  return (await response.json()) as PublicProfileDto;
}

export function usePublicProfile(username: string) {
  return useQuery({
    queryKey: ['public-profile', username],
    queryFn: () => fetchPublicProfile(username),
  });
}
