import { redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';

import { routing } from '@/lib/i18n/routing';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /auth/callback — route handler SANS préfixe de locale (Supabase OAuth /
 * magic link y reviennent tel quel depuis n'importe quelle locale).
 *
 * 1. Échange du `code` contre une session (cookies auth écrits).
 * 2. Hook de login streak, best-effort (silencieux en cas d'échec — le jeu
 *    reste utilisable, le streak se rattrape au login suivant).
 * 3. Profil sans username → /{locale}/onboarding ; sinon /{locale}.
 *
 * La locale de retour est portée par le param `?locale=` ajouté côté page
 * /login au `emailRedirectTo` / `redirectTo` (méthode simple et fiable,
 * aucun cookie supplémentaire).
 */

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  const requestedLocale = requestUrl.searchParams.get('locale');
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale;

  if (!code) {
    redirect(`/${locale}/login`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    redirect(`/${locale}/login`);
  }

  // Best-effort : la session rafraîchie est propagée via le header cookie.
  try {
    await fetch(new URL('/api/me/login-streak', requestUrl.origin), {
      method: 'POST',
      headers: { cookie: request.headers.get('cookie') ?? '' },
    });
  } catch {
    // Silencieux volontairement (SPEC §5.4 : le streak est idempotent).
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.username) {
    redirect(`/${locale}/onboarding`);
  }

  redirect(`/${locale}`);
}
