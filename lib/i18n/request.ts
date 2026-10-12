import fs from 'node:fs';
import path from 'node:path';

import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { routing } from './routing';

/**
 * lib/i18n/request.ts — configuration des messages next-intl (côté serveur).
 *
 * Mécanisme de merge des namespaces : le fichier racine `messages/{locale}.json`
 * est chargé, puis TOUS les `messages/{locale}/*.json` (sous-dossier par locale)
 * sont fusionnés sous la clé = nom du fichier sans extension
 * (`messages/fr/boosters.json` → `boosters`). Les agents qui ajoutent une page
 * déposent simplement leur `messages/{locale}/<page>.json` : AUCUNE modification
 * de ce fichier n'est nécessaire.
 *
 * Résolution de la config : chemin fourni au plugin officiel
 * `next-intl/plugin` (createNextIntlPlugin dans next.config.ts).
 */

function loadNamespaceFiles(locale: string): Record<string, unknown> {
  const dir = path.join(process.cwd(), 'messages', locale);
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => {
        const namespace = file.replace(/\.json$/, '');
        const raw = fs.readFileSync(path.join(dir, file), 'utf8');
        return [namespace, JSON.parse(raw) as unknown];
      }),
  );
}

function loadMessages(locale: string): Record<string, unknown> {
  const rootRaw = fs.readFileSync(
    path.join(process.cwd(), 'messages', `${locale}.json`),
    'utf8',
  );
  const root = JSON.parse(rootRaw) as Record<string, unknown>;
  return { ...root, ...loadNamespaceFiles(locale) };
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    // Timezone unique du produit (dates serveur Europe/Paris, SPEC §8) :
    // requis pour le SSR/prerender de useTranslations côté client
    // (sinon IntlError ENVIRONMENT_FALLBACK au build statique).
    timeZone: 'Europe/Paris',
    messages: loadMessages(locale),
  };
});
