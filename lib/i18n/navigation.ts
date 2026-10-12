import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

/**
 * lib/i18n/navigation.ts — primitives de navigation consciente de la locale.
 *
 * RÈGLE ABSOLUE pour les agents : TOUT lien interne ou redirection passe par
 * ces helpers (jamais `next/link` / `next/navigation` directement) — sinon le
 * préfixe de locale (`/fr`, `/en`) est perdu.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
