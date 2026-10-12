'use client';

import { useEffect } from 'react';

import { registerServiceWorker } from '@/lib/pwa/register';

/**
 * Enregistre le service worker Serwist. `registerServiceWorker` garde
 * lui-même le guard production — ce composant ne fait qu'orchestrer.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return null;
}
