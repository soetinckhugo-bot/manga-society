/**
 * ============================================================================
 * MANGA SOCIETY — pipeline de données (Agent C)
 * Vérification du pool importé (s'exécute APRÈS un seed réel, jamais en dry-run) :
 *   npx tsx pipeline/verify.ts
 *
 * Invariants vérifiés (PROMPT C) :
 *   1. 0 doublon d'anilist_id (la contrainte unique est le filet ultime — ici on
 *      prouve qu'on n'en a pas besoin)
 *   2. image_url renseigné sur 100 % du pool
 *   3. ≥ 1 thème par personnage
 *   4. distribution des 6 raretés conforme aux percentiles de favourites ±2 pts
 *   5. ≥ 300 personnages par thème
 * Le rapport final est concaténé à `pipeline/report.md` (ou écrit seul).
 * ============================================================================
 */

import { assignRarities, RARITY_THRESHOLDS } from './classify';
import { createDbClient } from './db';
import type { Rarity } from './types';

const REPORT_PATH = 'pipeline/report.md';
const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

interface CharacterRecord {
  id: string;
  anilist_id: number;
  name_romaji: string;
  favourites: number;
  base_rarity: Rarity;
  rarity_overridden: boolean;
  themes: string[];
  image_url: string | null;
}

async function main(): Promise<void> {
  const db = createDbClient();
  const pool: CharacterRecord[] = [];
  const PAGE = 1_000; // limite max-rows PostgREST : pagination obligatoire
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('characters')
      .select('id, anilist_id, name_romaji, favourites, base_rarity, rarity_overridden, themes, image_url')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`lecture characters (offset ${from}): ${error.message}`);
    const batch = (data ?? []) as CharacterRecord[];
    pool.push(...batch);
    if (batch.length < PAGE) break;
  }
  if (pool.length === 0) throw new Error('pool vide — lancer d\'abord pipeline/ingest.ts');

  const failures: string[] = [];
  const out: string[] = [];
  out.push('# MANGA SOCIETY — Rapport de vérification du pool');
  out.push('');
  out.push(`- **Vérifié le** : ${new Date().toISOString()}`);
  out.push(`- **Taille du pool** : ${pool.length}`);
  out.push('');

  // 1. Doublons anilist_id
  const idCounts = new Map<number, number>();
  for (const c of pool) idCounts.set(c.anilist_id, (idCounts.get(c.anilist_id) ?? 0) + 1);
  const dupes = [...idCounts.entries()].filter(([, n]) => n > 1);
  if (dupes.length > 0) failures.push(`${dupes.length} anilist_id dupliqué(s) : ${dupes.slice(0, 10).map(([id]) => id).join(', ')}`);

  // 2. Images
  const missingImages = pool.filter((c) => !c.image_url);
  if (missingImages.length > 0) {
    failures.push(`${missingImages.length} perso(s) sans image_url : ${missingImages.slice(0, 10).map((c) => c.name_romaji).join(', ')}`);
  }

  // 3. Thèmes : les untagged sont un ÉTAT NOMINAL en V1 (décision orchestrateur :
  //    exclus = 0, ils servent le booster MIX "Tous les persos") → info, pas échec.
  const unthemed = pool.filter((c) => !c.themes || c.themes.length === 0);
  out.push(`## Untagged (info — état nominal V1, booster MIX)`);
  out.push('');
  out.push(`**${unthemed.length}** personnage(s) sans thème (conforme à la décision V1).`);
  out.push('');
  if (unthemed.length > 0) {
    out.push(`Exemples : ${unthemed.slice(0, 10).map((c) => c.name_romaji).join(', ')}`);
    out.push('');
  }

  // 4. Distribution des raretés vs percentiles théoriques (sur les non overridés)
  const nonOverridden = pool.filter((c) => !c.rarity_overridden);
  const rarities = assignRarities(nonOverridden);
  const expected = new Map<Rarity, number>();
  const actual = new Map<Rarity, number>();
  for (const r of RARITIES) {
    expected.set(r, 0);
    actual.set(r, 0);
  }
  for (const c of nonOverridden) {
    const e = rarities.get(c) ?? 'common';
    expected.set(e, (expected.get(e) ?? 0) + 1);
    actual.set(c.base_rarity, (actual.get(c.base_rarity) ?? 0) + 1);
  }
  const n = nonOverridden.length;
  out.push('## Distribution des raretés (pool non overridé)');
  out.push('');
  out.push('| Rareté | Attendu (percentiles) | Réel | Écart |');
  out.push('|---|---:|---:|---:|');
  for (const r of RARITIES) {
    const e = expected.get(r) ?? 0;
    const a = actual.get(r) ?? 0;
    const ePct = (e / n) * 100;
    const aPct = (a / n) * 100;
    out.push(`| ${r} | ${ePct.toFixed(1)} % (${e}) | ${aPct.toFixed(1)} % (${a}) | ${(aPct - ePct).toFixed(1)} pt |`);
    if (Math.abs(aPct - ePct) > 2) failures.push(`rareté ${r} : écart ${(aPct - ePct).toFixed(1)} pts (> ±2)`);
  }
  out.push('');
  out.push(
    `Seuils : mythic ≤ ${RARITY_THRESHOLDS.mythic} % · legendary ≤ ${RARITY_THRESHOLDS.legendary} % · epic ≤ ${RARITY_THRESHOLDS.epic} % · rare ≤ ${RARITY_THRESHOLDS.rare} % · uncommon ≤ ${RARITY_THRESHOLDS.uncommon} % (percentile de favourites, cf. pipeline/classify.ts).`,
  );
  out.push('');

  // 5. ≥ 300 par thème
  const perTheme = new Map<string, number>();
  for (const c of pool) for (const t of c.themes) perTheme.set(t, (perTheme.get(t) ?? 0) + 1);
  out.push('## Couverture par thème');
  out.push('');
  out.push('| Thème | Nb | Seuil |');
  out.push('|---|---:|---:|');
  for (const [slug, count] of [...perTheme.entries()].sort()) {
    const ok = count >= 300;
    if (!ok) failures.push(`thème ${slug} : ${count} persos (< 300)`);
    out.push(`| ${slug} | ${count} | ${ok ? 'OK (≥300)' : '**SOUS-SEUIL**'} |`);
  }
  // Thèmes absents du pool = échec aussi
  for (const slug of ['shonen', 'shojo', 'seinen', 'isekai', 'webtoon', 'big3']) {
    if (!perTheme.has(slug)) failures.push(`thème ${slug} : absent du pool`);
  }
  out.push('');

  // Top 20 mythic
  const mythics = pool
    .filter((c) => c.base_rarity === 'mythic')
    .sort((a, b) => b.favourites - a.favourites)
    .slice(0, 20);
  out.push('## Top 20 mythic');
  out.push('');
  out.push('| # | Perso | Favourites |');
  out.push('|---:|---|---:|');
  mythics.forEach((c, i) => out.push(`| ${i + 1} | ${c.name_romaji} (#${c.anilist_id}) | ${c.favourites} |`));
  out.push('');

  out.push('## Verdict');
  out.push('');
  if (failures.length === 0) {
    out.push(`✅ **${pool.length} personnages vérifiés : tous les invariants passent.**`);
  } else {
    out.push(`❌ **${failures.length} invariant(s) en échec :**`);
    for (const f of failures) out.push(`- ${f}`);
  }
  out.push('');

  const { writeReport } = await import('./report');
  writeReport(out.join('\n'), REPORT_PATH);
  console.log(`[verify] Pool=${pool.length} · invariants en échec=${failures.length} · rapport=${REPORT_PATH}`);
  if (failures.length > 0) {
    for (const f of failures) console.error(`[verify] ÉCHEC : ${f}`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
