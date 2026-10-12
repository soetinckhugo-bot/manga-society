/**
 * ============================================================================
 * MANGA SOCIETY — pipeline de données (Agent C)
 * Accès base — UPSERTS IDEMPOTENTS UNIQUEMENT (clé `anilist_id`), JAMAIS de DDL
 * (frontière SPEC §4 : le schéma appartient à l'Agent 0). Le service role bypass
 * la RLS : ce module est un script serveur, jamais importé par le frontend.
 *
 * Garanties :
 * - `print_count` / `wishlist_count` ne sont JAMAIS fournis → jamais écrasés.
 * - `rarity_overridden = true` → `base_rarity` préservée (le pipeline ne la
 *   recalcule pas), les autres champs restent à jour.
 * ============================================================================
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { CharacterRow } from './types';

function loadEnvFiles(): void {
  for (const file of ['.env', '.env.local']) {
    try {
      process.loadEnvFile(file);
    } catch {
      // fichier absent : on se fie à l'environnement du process
    }
  }
}

export function createDbClient(): SupabaseClient {
  loadEnvFiles();
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) et SUPABASE_SERVICE_ROLE_KEY requis (env ou .env / .env.local).',
    );
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export interface UpsertOutcome {
  inserted: number;
  updated: number;
  skippedOverridden: number;
}

/**
 * Upsert idempotent d'un lot de personnages. Découpe new / existing /
 * overridden avant d'écrire pour ne jamais écraser une rareté overridée.
 * `anilist_id` unique en base : rejouer ce lot = 0 doublon, mise à jour en place.
 * Les existants sont lus par plages de 1 000 (limite max-rows PostgREST) —
 * un `.in()` avec des milliers d'ids dépasse la longueur d'URL admise.
 */
export async function upsertCharacters(
  db: SupabaseClient,
  rows: CharacterRow[],
  batchSize = 500,
): Promise<UpsertOutcome> {
  const outcome: UpsertOutcome = { inserted: 0, updated: 0, skippedOverridden: 0 };
  if (rows.length === 0) return outcome;

  const PAGE = 1_000;
  const existingMap = new Map<number, boolean>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('characters')
      .select('anilist_id, rarity_overridden')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`lecture characters existants (offset ${from}): ${error.message}`);
    const batch = (data ?? []) as Array<{ anilist_id: number; rarity_overridden: boolean }>;
    for (const e of batch) existingMap.set(e.anilist_id, e.rarity_overridden);
    if (batch.length < PAGE) break;
  }

  const toInsert: CharacterRow[] = [];
  const toUpdate: CharacterRow[] = [];
  for (const row of rows) {
    const isExisting = existingMap.has(row.anilist_id);
    const overridden = existingMap.get(row.anilist_id) === true;
    if (!isExisting) toInsert.push(row);
    else if (overridden) outcome.skippedOverridden += 1; // base_rarity figée manuellement
    else toUpdate.push(row);
  }

  for (let i = 0; i < toInsert.length; i += batchSize) {
    const { error } = await db.from('characters').upsert(toInsert.slice(i, i + batchSize), {
      onConflict: 'anilist_id',
      ignoreDuplicates: true,
    });
    if (error) throw new Error(`insert characters: ${error.message}`);
  }
  outcome.inserted = toInsert.length;

  for (let i = 0; i < toUpdate.length; i += batchSize) {
    const { error } = await db.from('characters').upsert(toUpdate.slice(i, i + batchSize), {
      onConflict: 'anilist_id',
    });
    if (error) throw new Error(`update characters: ${error.message}`);
  }
  outcome.updated = toUpdate.length;

  return outcome;
}

/**
 * Recalcule les raretés de TOUT le pool par percentiles de `favourites`
 * (les raretés du batch courant ne reflètent le "pool final" que si le pool
 * est complet). Les persos `rarity_overridden` sont ignorés. Idempotent :
 * relancer = les raretés inchangées ne sont pas réécrites.
 */
export async function recalculateRarities(db: SupabaseClient): Promise<number> {
  type PoolRow = { id: string; anilist_id: number; favourites: number; base_rarity: string; rarity_overridden: boolean };
  const pool: PoolRow[] = [];
  const PAGE = 1_000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('characters')
      .select('id, anilist_id, favourites, base_rarity, rarity_overridden')
      .eq('rarity_overridden', false)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`lecture pool pour raretés (offset ${from}): ${error.message}`);
    const batch = (data ?? []) as PoolRow[];
    pool.push(...batch);
    if (batch.length < PAGE) break;
  }
  if (pool.length === 0) return 0;

  const { assignRarities } = await import('./classify');
  const rarities = assignRarities(pool);

  let changed = 0;
  const updates: Array<{ id: string; base_rarity: string }> = [];
  for (const row of pool) {
    const next = rarities.get(row);
    if (next && next !== row.base_rarity) {
      updates.push({ id: row.id, base_rarity: next });
    }
  }
  for (let i = 0; i < updates.length; i += 500) {
    const { error: upError } = await db
      .from('characters')
      .upsert(updates.slice(i, i + 500), { onConflict: 'id' });
    if (upError) throw new Error(`recalcul raretés: ${upError.message}`);
    changed += updates.slice(i, i + 500).length;
  }
  return changed;
}
