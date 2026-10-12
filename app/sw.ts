/// <reference lib="webworker" />

import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist, StaleWhileRevalidate, ExpirationPlugin } from 'serwist';

/**
 * app/sw.ts — service worker MANGA SOCIETY (source bundlée par la route
 * handler Serwist `app/serwist/[path]/route.ts` → servi à /serwist/sw.js) ;
 * enregistré côté client UNIQUEMENT en production par lib/pwa/register.ts.
 *
 * Politique (SPEC §6) :
 * - precache du shell applicatif via le manifest de build (__SW_MANIFEST) ;
 * - images AniList/Jikan en StaleWhileRevalidate, expiration LRU 200 entrées ;
 * - fallback de navigation → /offline (jamais la page d'erreur navigateur) ;
 * - skipWaiting + clientsClaim (le nouveau SW prend le contrôle immédiatement).
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const CACHE_EXPIRATION = {
  maxEntries: 200,
  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 jours
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  fallbacks: {
    entries: [
      {
        // Toutes les pages vivent sous préfixe de locale : seule
        // /fr/offline (rendue statique au build) est garantie précachée.
        url: '/fr/offline',
        matcher: ({ request }) => request.mode === 'navigate',
      },
    ],
  },
  runtimeCaching: [
    {
      // Images de personnages (AniList CDN).
      matcher: ({ url }) => /(^|\.)anilist\.co$/.test(url.hostname),
      handler: new StaleWhileRevalidate({
        cacheName: 'anilist-images',
        plugins: [new ExpirationPlugin(CACHE_EXPIRATION)],
      }),
    },
    {
      // Images de fallback (Jikan / MyAnimeList CDN).
      matcher: ({ url }) => url.hostname === 'cdn.myanimelist.net',
      handler: new StaleWhileRevalidate({
        cacheName: 'jikan-images',
        plugins: [new ExpirationPlugin(CACHE_EXPIRATION)],
      }),
    },
  ],
});

serwist.addEventListeners();
