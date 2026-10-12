import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/types/database';

/**
 * lib/supabase/client.ts — client Supabase pour les CLIENT COMPONENTS.
 *
 * CONTRAT TEMPORAIRE (Agent B) : cette couche est la propriété de B pour le
 * frontend. L'Agent A pourra l'aligner avec `lib/server/` plus tard (annonce
 * dans HANDOFF.md) — ne pas importer `lib/server/` ici.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // PKCE : le magic link / OAuth reviennent avec un `?code=` échangé
        // côté serveur dans app/[locale]/auth/callback (le flow « implicit »
        // repose sur un #fragment que le route handler ne verrait jamais).
        flowType: 'pkce',
      },
    },
  );
}
