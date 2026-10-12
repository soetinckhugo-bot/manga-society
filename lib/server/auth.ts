/**
 * lib/server/auth.ts — garde d'authentification des route handlers.
 *
 * La protection des routes API se fait ICI (requireUser), PAS dans
 * middleware.ts (propriété de l'Agent B — SPEC §4 règle 7). getUser()
 * valide le token auprès du serveur Auth (pas de simple lecture de cookie).
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';

import { getUserClient } from '@/lib/server/supabase';
import type { Database } from '@/types/database';

export interface AuthContext {
  supabase: SupabaseClient<Database>;
  user: User;
}

/**
 * Authentifie la requête courante. Renvoie le client Supabase au contexte
 * user + le user, ou null si non authentifié (→ 401 'UNAUTHENTICATED').
 */
export async function requireUser(): Promise<AuthContext | null> {
  const { supabase, user } = await getRequestAuth();
  if (!user) return null;
  return { supabase, user };
}

/**
 * Authentification NON bloquante : renvoie TOUJOURS le client cookie-based
 * (utilisable sans session, en anon) + le user ou null. Utilisé par
 * handleApi pour les routes 'optional' / 'public'.
 */
export async function getRequestAuth(): Promise<{
  supabase: SupabaseClient<Database>;
  user: User | null;
}> {
  const supabase = await getUserClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { supabase, user: error || !user ? null : user };
}
