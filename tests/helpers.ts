/**
 * tests/helpers.ts — fixtures partagés des tests Agent E (métier, concurrence,
 * RLS). Mêmes règles que scripts/smoke-engine.test.ts :
 *
 *   * Cible SUPABASE LOCAL par défaut ; override explicite
 *     SMOKE_ENGINE_ALLOW_REMOTE=1 (audits cloud autorisés par l'orchestrateur,
 *     nettoyage obligatoire en afterAll).
 *   * L'économie n'est JAMAIS écrite directement : seuls les fixtures
 *     (users, persos, ancrages de recharge, compteurs de départ) passent par
 *     le service role, exactement comme le smoke-engine de l'Agent A.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

for (const envFile of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* absent : on se fie à l'environnement */
  }
}

export const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function isLocalTarget(url: string): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

export const IS_CONFIGURED =
  Boolean(SUPABASE_URL && SERVICE_ROLE_KEY) &&
  (isLocalTarget(SUPABASE_URL) || process.env.SMOKE_ENGINE_ALLOW_REMOTE === '1');

export const RUN_ID = `e${Date.now().toString(36)}`;
// Namespace de fixtures PAR WORKER vitest : les fichiers de test s'exécutent
// en parallèle (forks) contre la MÊME base locale, et cleanup() (afterAll)
// supprime les persos fixtures de SA plage anilist_id. Un ANILIST_BASE
// partagé faisait donc qu'un fichier fini supprimait les fixtures d'un autre
// encore en cours (CI 2026-10-12 : CHARACTER_NOT_FOUND + carte null dans
// economy.business) — sur le cloud le DELETE était refusé par les grants
// (0006), d'où des runs cloud verts trompeurs. Chaque worker décale sa plage
// de 10 000 ; les fichiers d'un même worker tournent en séquence, donc le
// cleanup inter-fichiers reste sûr (seed upsert idempotent).
const WORKER = Number(process.env.VITEST_WORKER_ID ?? 1);
export const ANILIST_BASE = 9_200_000 + (WORKER - 1) * 10_000;
// Préfixe de thèmes dédiés QA, lui aussi par worker (cleanup() ne touche
// alors que les thèmes de SON worker — jamais ceux d'un fichier parallèle).
export const QA_THEME_PREFIX = `qa-w${WORKER}`;

export type Admin = SupabaseClient<Database>;

export function makeAdmin(): Admin {
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Client navigateur authentifié (user JWT réel — nécessaire pour l'audit RLS). */
export async function makeUserClient(email: string, password: string) {
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return client;
}

/** Crée n users de test (email/password confirmé) + profil ; retourne les ids. */
export async function createUsers(admin: Admin, n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    // Retry : l'API admin auth peut rate-limiter les créations en rafale.
    let lastErr = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await admin.auth.admin.createUser({
        email: `qa-${RUN_ID}-${i}@manga-society.local`,
        password: 'qa-password-1234',
        email_confirm: true,
        user_metadata: { username: `qa_${RUN_ID}_${i}` },
      });
      if (!error) {
        ids.push(data.user!.id);
        lastErr = '';
        break;
      }
      lastErr = error.message;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
    if (lastErr) throw new Error(`createUser: ${lastErr}`);
  }
  return ids;
}

export function userEmail(i: number): string {
  return `qa-${RUN_ID}-${i}@manga-society.local`;
}

/** Insère les 72 persos de fixture (2 par rareté × thème) — idempotent. */
export async function seedFixtureCharacters(admin: Admin): Promise<void> {
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;
  const themes = ['shonen', 'shojo', 'webtoon', 'big3', 'seinen', 'isekai'] as const;
  const rows = rarities.flatMap((rarity, ri) =>
    themes.flatMap((theme, ti) =>
      [0, 1].map((n) => ({
        anilist_id: ANILIST_BASE + ri * 100 + ti * 10 + n,
        name_romaji: `QA ${rarity} ${theme} ${n}`,
        anime_title: `QA ${theme}`,
        favourites: 1000 + ri,
        base_rarity: rarity,
        themes: [theme],
        image_url: 'https://placehold.co/300x420/111827/94a3b8?text=QA',
        image_url_fallback: null,
      })),
    ),
  );
  const { error } = await admin.from('characters').upsert(rows, { onConflict: 'anilist_id' });
  if (error) throw new Error(`seed persos: ${error.message}`);
}

/** Ancre la recharge dans le passé → la RPC crédite le stock due (cap 10). */
export async function refillStock(admin: Admin, userId: string): Promise<void> {
  const { error } = await admin
    .from('profiles')
    .update({ last_booster_recharge: '2000-01-01T00:00:00Z' })
    .eq('id', userId);
  if (error) throw new Error(`refill: ${error.message}`);
}

export function freshKey(): string {
  return crypto.randomUUID();
}

/**
 * Nettoyage complet : users (cascade) + persos fixture + thèmes dédiés QA.
 *
 * Note cloud : le grant 0006 n'accorde pas DELETE sur characters au
 * service_role → le DELETE échoue sur le cloud ; repli = vider `themes`
 * des fixtures (plus jamais tirées par aucun booster à thème — le mix,
 * seul endroit où elles réapparaîtraient, n'est pas implémenté). La
 * suppression physique reste une dette à trancher par l'Agent 0
 * (grant delete ou purge SQL — cf. QA_REPORT).
 */
export async function cleanup(admin: Admin, userIds: string[]): Promise<void> {
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  const del = await admin
    .from('characters')
    .delete()
    .gte('anilist_id', ANILIST_BASE)
    .lt('anilist_id', ANILIST_BASE + 1_000);
  if (del.error) {
    await admin
      .from('characters')
      .update({ themes: [] })
      .gte('anilist_id', ANILIST_BASE)
      .lt('anilist_id', ANILIST_BASE + 1_000);
  }
  const delThemes = await admin.from('themes').delete().like('slug', `${QA_THEME_PREFIX}-%`);
  if (delThemes.error) {
    await admin.from('themes').update({ sort_order: 99 }).like('slug', `${QA_THEME_PREFIX}-%`);
  }
}

/** Erreur Postgres métier extraite du message PostgREST. */
export function pgError(e: { message?: string } | null): string {
  return String(e?.message ?? '');
}

/**
 * Fixture hors économie : exécute une écriture service role et ÉCHOUE fort
 * si elle est refusée (jamais de silence — un fixture non appliqué fausse
 * tout le test). Local uniquement : le service_role de la stack locale a les
 * grants ; sur cloud seul characters est grantié (0006) — utiliser alors les
 * RPC (scripts/audit-cloud.ts).
 */
export async function fx(writable: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await writable;
  if (error) throw new Error(`fixture refusée : ${pgError(error as { message?: string })}`);
}
