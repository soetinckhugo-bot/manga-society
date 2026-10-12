/**
 * lib/pwa/register.ts — enregistrement du service worker.
 *
 * Règles (SPEC §6) :
 * - UNIQUEMENT en production (process.env.NODE_ENV === 'production') : en dev,
 *   un SW émettrait des réponses fantômes au hot reload.
 * - Guard navigateur ('serviceWorker' in navigator) pour les navigateurs
 *   sans support (et les crawlers).
 * - Le SW est servi par la route handler Serwist (`@serwist/turbopack`,
 *   app/serwist/[path]/route.ts) : @serwist/next (webpack) ne s'intègre pas
 *   au build Turbopack de Next 16.
 */
export const SERWIST_SW_URL = '/serwist/sw.js';

export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(SERWIST_SW_URL)
      .catch((error: unknown) => {
        // Échec d'enregistrement : non bloquant (l'app reste utilisable en ligne).
        console.warn('[pwa] Service worker registration failed:', error);
      });
  });
}
