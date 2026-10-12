import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

/**
 * lib/supabase/middleware.ts — rafraîchissement de session Supabase dans le
 * middleware (appelé depuis proxy.ts).
 *
 * Recrée le client avec les cookies de la requête entrante et réécrit les
 * cookies rafraîchis dans la réponse (modifie le header `Set-Cookie` en place,
 * sans casser les rewrites next-intl).
 *
 * CONTRAT TEMPORAIRE (Agent B) : propriété de B pour le frontend ; l'Agent A
 * pourra aligner avec `lib/server/` plus tard (annonce dans HANDOFF.md).
 */

export interface SessionResult {
  supabaseResponse: NextResponse;
  user: User | null;
}

export async function updateSession(request: NextRequest): Promise<SessionResult> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user };
}
