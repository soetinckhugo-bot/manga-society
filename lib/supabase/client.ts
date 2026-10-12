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
  );
}
