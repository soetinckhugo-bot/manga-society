import { defineRouting } from 'next-intl/routing';

/**
 * lib/i18n/routing.ts — routing i18n de MANGA SOCIETY.
 *
 * Locales supportés : fr (défaut) et en. Le préfixe de locale est TOUJOURS
 * présent dans l'URL (`/fr/…`, `/en/…`) — les liens internes doivent passer
 * par le `Link`/`useRouter` de `@/lib/i18n/navigation` pour rester cohérents.
 */
export const routing = defineRouting({
  locales: ['fr', 'en'],
  defaultLocale: 'fr',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];
