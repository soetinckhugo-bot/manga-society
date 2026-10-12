import { redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';

import { routing } from '@/lib/i18n/routing';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /{locale}/auth/callback — callback auth SOUS le préfixe de locale.
 *
 * Pourquoi cette adresse et pas /auth/callback : le proxy i18n rebascule
 * toute URL non préfixée vers sa forme canonique /fr/…|/en/… (localePrefix
 * 'always'). Supabase revient donc TOUJOURS ici après un magic link ou
 * OAuth, même si emailRedirectTo pointait sans préfixe.
 *
 * 1. Échange du `code` contre une session (cookies auth écrits).
 * 2. Hook de login streak, best-effort (silencieux en cas d'échec — le jeu
 *    reste utilisable, le streak se rattrape au login suivant).
 * 3. Profil sans username → /{locale}/onboarding ; sinon /{locale}.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale: requestedLocale } = await params;
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale;

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

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
