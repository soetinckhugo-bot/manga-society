/**
 * lib/server/supabase.ts — clients Supabase côté serveur (route handlers).
 *
 * - `getUserClient()` : client lié aux cookies de la requête (session du
 *   joueur). C'est lui qui appelle les RPC : les lectures respectent la RLS
 *   (propriétaire uniquement), les mutations passent par les fonctions
 *   SECURITY DEFINER. Le rafraîchissement de session y est branché
 *   (@supabase/ssr setAll) — les handlers B (auth/callback) en bénéficient
 *   aussi via la même factory.
 * - `getServiceClient()` : service role (bypass RLS). SERVEUR UNIQUEMENT,
 *   jamais importé par un fichier client (standard commun n°11). Réservé aux
 *   scripts et à un usage serveur privilégié — les handlers de jeu
 *   n'en ont pas besoin (l'économie est dans les RPC).
 *
 * Env (cf. .env.example) : NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import type { Database } from '@/types/database';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[supabase] Variable d'environnement manquante : ${name}`);
  }
  return value;
}

/** Client Supabase au contexte de l'utilisateur connecté (cookies). */
export async function getUserClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Appelé depuis un Server Component (pas de réponse mutable) :
            // ignorable — le refresh de session se fera dans un contexte
            // autorisé (route handler, server action).
          }
        },
      },
    },
  );
}

/** Client service role (bypass RLS) — scripts serveur uniquement. */
export function getServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Client SANS cookies pour les LECTURES PUBLIQUES (themes, cosmetics,
 * characters, profils publics…). Indispensable sous `cacheComponents` :
 * `cookies()` hors d'une Suspense bloque le prerender statique. Ne JAMAIS
 * utiliser pour des données utilisateur (RLS propriétaire → résultats vides)
 * ni pour des écrits.
 */
export function createPublicClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
