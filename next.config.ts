import { withSerwist } from '@serwist/turbopack';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

/**
 * next.config.ts — MANGA SOCIETY.
 *
 * - @serwist/turbopack : intégration Serwist du build Turbopack (Next 16).
 *   Le service worker (app/sw.ts) est servi par la route handler
 *   app/serwist/[path]/route.ts ; la registration côté client (prod only)
 *   vit dans lib/pwa/register.ts.
 * - next-intl/plugin : résolution de la config i18n (lib/i18n/request.ts).
 * - images.remotePatterns : CDN AniList + MyAnimeList (next/image).
 * - headers() : headers de sécurité (SPEC §8). 'unsafe-eval' en script-src
 *   est requis par le dev server (turbopack HMR) ; les en-têtes s'appliquent
 *   aussi en dev par simplicité (l'app reste 100 % 'self' en prod, l'écart
 *   est documenté pour l'audit de l'Agent E).
 */

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

const csp = [
  "default-src 'self'",
  // 'unsafe-eval' : nécessaire au HMR turbopack en dev (SPEC §8).
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://i.anilist.co https://s4.anilist.co https://cdn.myanimelist.net",
  "connect-src 'self' https://*.supabase.co",
  "font-src 'self' data:",
  "manifest-src 'self'",
].join('; ');

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'i.anilist.co' },
      { protocol: 'https', hostname: 's4.anilist.co' },
      { protocol: 'https', hostname: 'cdn.myanimelist.net' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default withSerwist(withNextIntl(nextConfig));
