'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { AbstractIntlMessages } from 'next-intl';

/**
 * Providers racine (client) :
 * - next-intl : messages du namespace racine + sous-dossiers `messages/{locale}/*.json`
 *   (chargés côté serveur dans app/[locale]/layout.tsx).
 * - React Query : staleTime 30 s (aligné sur le polling state boosters),
 *   pas de refetch au focus, 1 retry max.
 *
 * Le Toaster sonner est monté UNE SEULE FOIS dans le layout serveur —
 * ne pas en ajouter d'autre.
 */

interface ProvidersProps {
  locale: string;
  messages: AbstractIntlMessages;
  children: ReactNode;
}

export function Providers({ locale, messages, children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      // Timezone globale (dates serveur Europe/Paris, SPEC §8) : requis pour
      // le SSR/prerender des composants client (sinon IntlError
      // ENVIRONMENT_FALLBACK au build statique).
      timeZone="Europe/Paris"
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}
