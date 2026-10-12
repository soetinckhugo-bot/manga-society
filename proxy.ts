import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';

import { routing } from '@/lib/i18n/routing';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * proxy.ts (Next 16 : anciennement middleware.ts) — combine :
 *   (a) le routing i18n next-intl (préfixe de locale /fr, /en, redirects) ;
 *   (b) le rafraîchissement de session Supabase (cookies auth réécrits à
 *       chaque requête) ;
 *   (c) la garde d'accès aux pages de jeu : sans session, redirect vers
 *       /{locale}/login.
 *
 * La garde auth des ROUTES API ne vit PAS ici (requireUser() côté handler,
 * Agent A) — seules les pages sont protégées.
 */

const handleI18nRouting = createIntlMiddleware(routing);

/** Segments de pages réservées aux utilisateurs connectés (sans préfixe locale). */
const PROTECTED_SEGMENTS = new Set(['boosters', 'collection', 'shop', 'onboarding']);

const LOCALE_PATTERN = /^\/(fr|en)(?=\/|$)/;

export default async function proxy(request: NextRequest) {
  // (b) Session Supabase : rafraîchit les cookies auth (getUser lève un
  // réseau vers Supabase quand la session doit être rafraîchie).
  const { supabaseResponse, user } = await updateSession(request);

  // (c) Garde des pages de jeu, agnostique au préfixe de locale.
  const localeMatch = LOCALE_PATTERN.exec(request.nextUrl.pathname);
  const locale = localeMatch?.[1] ?? routing.defaultLocale;
  const pathWithoutLocale = request.nextUrl.pathname.replace(LOCALE_PATTERN, '') || '/';
  const firstSegment = pathWithoutLocale.split('/').filter(Boolean)[0];

  if (firstSegment && PROTECTED_SEGMENTS.has(firstSegment) && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `/${locale}/login`;
    loginUrl.search = '';
    return NextResponse.redirect(loginUrl);
  }

  // (a) Routing i18n (rewrite vers la locale, redirect canonique).
  const response = handleI18nRouting(request);

  // Les cookies de session rafraîchis doivent vivre sur la réponse finale,
  // quel que soit le type de réponse du middleware i18n.
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie.name, cookie.value, cookie);
  });

  return response;
}

export const config = {
  matcher: [
    /*
     * Tout sauf :
     * - app/api/** (les handlers gèrent leur propre auth)
     * - les sorties de build Next (_next/static, _next/image, _next/webpack)
     * - les assets statiques racine (favicon, manifest, sw.js, icons, …)
     */
    '/((?!api|_next/static|_next/image|_next/webpack|icons|favicon.ico|manifest.webmanifest|sw.js|.*\\..*).*)',
  ],
};
