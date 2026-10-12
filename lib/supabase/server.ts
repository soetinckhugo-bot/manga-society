import type { SupabaseClient, User } from '@supabase/supabase-js';

import { createPublicClient, getUserClient } from '@/lib/server/supabase';
import type { Database } from '@/types/database';

/**
 * lib/supabase/server.ts — client Supabase pour le SERVEUR
 * (Server Components, Route Handlers, Server Actions).
 *
 * UNIFICATION (Agent A) : la fabrique de clients vit désormais en UN SEUL
 * endroit, `lib/server/supabase.ts` (clients route handlers + scripts). Ce
 * fichier n'est plus qu'une façade pour les imports existants de l'Agent B :
 *   - `createClient()`        ≡ getUserClient()  (cookies, session)
 *   - `createPublicClient()`  ≡ createPublicClient (sans cookies, lectures
 *                               publiques / prerender)
 * Le store de cookies passe par `await cookies()` (Next 16) avec `getAll` /
 * `setAll` : la session rafraîchie par Supabase est réécrite dans les cookies
 * de la réponse en fin de requête.
 */

/** Client Supabase au contexte de l'utilisateur connecté (cookies). */
export async function createClient(): Promise<SupabaseClient<Database>> {
  return getUserClient();
}

export { createPublicClient };

/**
 * Utilisateur de la session courante, ou null. À utiliser côté serveur
 * (Server Component / Route Handler). Ne lève JAMAIS : une session absente
 * ou expirée se traduit par `null`.
 */
export async function getSessionUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
