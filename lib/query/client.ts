import { QueryClient } from '@tanstack/react-query';

/**
 * lib/query/client.ts — factory du QueryClient partagé.
 *
 * Le provider (components/providers.tsx) instancie CE factory côté client.
 * `getQueryClient` est fourni pour les usages serveur ponctuels (Server
 * Component qui prefetch) : il retourne toujours un client frais côté
 * serveur, le singleton navigateur côté client.
 */

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Serveur : un client par requête (pas de partage d'état entre users).
    return makeQueryClient();
  }
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
