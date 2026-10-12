import { randomUUID } from 'node:crypto';

import { createSerwistRoute } from '@serwist/turbopack';

/**
 * app/serwist/[path]/route.ts — route handler Serwist (mode Turbopack).
 *
 * Sert le service worker compilé depuis `app/sw.ts` à `/serwist/sw.js`,
 * avec le precache manifest du build. Remplace l'intégration webpack
 * (`@serwist/next`), inactive sous le build Turbopack de Next 16.
 *
 * La page offline est précachée explicitement : c'est le fallback de
 * navigation du SW (SPEC §6). Revision régénérée à chaque build pour
 * forcer la mise à jour du precache.
 */
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: 'app/sw.ts',
    additionalPrecacheEntries: [
      { url: '/fr/offline', revision: randomUUID() },
      { url: '/en/offline', revision: randomUUID() },
    ],
    // esbuild natif (défaut Windows déjà natif) — bundling du SW au build.
    useNativeEsbuild: true,
  });
