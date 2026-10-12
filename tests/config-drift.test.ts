/**
 * ============================================================================
 * tests/config-drift.test.ts — CONFORMITÉ STATIC lib/config.ts ↔ SQL (Agent E)
 *
 * lib/config.ts est la SOURCE UNIQUE DE VÉRITÉ (standard commun n°12) : les
 * mêmes valeurs sont dupliquées côté SQL en paramètres DEFAULT des RPC. Ce
 * fichier vérifie PAR LECTURE DES MIGRATIONS que les valeurs SQL n'ont pas
 * dérivé de la config TS, et documente en `it.fails` les écarts connus
 * (le test devient rouge "fails test passed" dès que le propriétaire corrige,
 * forçant le retrait du marqueur — CI toujours verte en attendant).
 *
 * Pur : aucune base requise.
 * ============================================================================
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { GAME_CONFIG, RARITIES, burnValueFor, printVisualTier } from '@/lib/config';

const MIG_0001 = readFileSync('supabase/migrations/0001_functions.sql', 'utf8');
const MIG_0004 = readFileSync('supabase/migrations/0004_fix_premium_booster.sql', 'utf8');
const MIG_0008 = readFileSync('supabase/migrations/0008_hotfix_preprod.sql', 'utf8');

/** Extrait un littéral jsonb de poids `'{...}'::jsonb` d'une migration. */
function extractJsonbWeights(sql: string, occurrence = 0): Record<string, number> {
  const matches = [...sql.matchAll(/'(\{[^']+\})'::jsonb/g)];
  const raw = matches[occurrence]?.[1];
  if (!raw) throw new Error('littéral jsonb introuvable');
  return JSON.parse(raw) as Record<string, number>;
}

describe('conformité SQL ↔ lib/config.ts (source unique de vérité)', () => {
  it('poids de rareté du booster : DEFAULT SQL == rarityWeights', () => {
    // Premier littéral de poids complet de 0001 = défaut d'open_booster.
    const sql = extractJsonbWeights(MIG_0001, 0);
    for (const r of RARITIES) {
      expect(sql[r], `poids SQL ${r}`).toBe(GAME_CONFIG.rarityWeights[r]);
    }
  });

  it('pack du jour : DEFAULT SQL E+ == rarityWeights restreints aux tiers E+', () => {
    const daily = extractJsonbWeights(MIG_0001, 2); // 3e littéral = claim_daily_pack
    expect(daily).toEqual({
      epic: GAME_CONFIG.rarityWeights.epic,
      legendary: GAME_CONFIG.rarityWeights.legendary,
      mythic: GAME_CONFIG.rarityWeights.mythic,
    });
  });

  it('roll premium : p_guaranteed_legendary_chance == premium.weights (85/15)', () => {
    expect(MIG_0004).toContain('p_guaranteed_legendary_chance numeric default 0.85');
    const { weights } = GAME_CONFIG.premium;
    const total = weights.legendary + weights.mythic;
    expect(weights.legendary / total).toBeCloseTo(0.85, 10);
  });

  it('table de burn : DEFAULT SQL == burn.baseValues', () => {
    const sql = extractJsonbWeights(MIG_0001, 3); // 4e littéral = burn_card
    for (const r of RARITIES) {
      expect(sql[r], `burn SQL ${r}`).toBe(GAME_CONFIG.burn.baseValues[r]);
    }
  });

  it('multiplicateur de demande wishlist : /1000 plafonné à 2 (burn_card)', () => {
    expect(MIG_0001).toContain('least(v_wishlist_count / 1000.0, 2)');
    expect(GAME_CONFIG.burn.wishlistDemand.divisor).toBe(1000);
    expect(GAME_CONFIG.burn.wishlistDemand.maxBonus).toBe(2);
    // Cohérence de l'arrondi avec burnValueFor côté TS.
    expect(burnValueFor('legendary', 0)).toBe(80);
    expect(burnValueFor('legendary', 1000)).toBe(160);
    expect(burnValueFor('legendary', 999_999)).toBe(240); // plafond ×2
    expect(burnValueFor('mythic', 500)).toBe(Math.round(200 * 1.5));
  });

  it('pity : seuils SQL 25/200 == config.pity', () => {
    expect(MIG_0001).toContain('v_pity_m >= 200');
    expect(MIG_0001).toContain('v_pity_l >= 25');
    expect(GAME_CONFIG.pity.legendary).toBe(25);
    expect(GAME_CONFIG.pity.mythic).toBe(200);
  });

  it('doré : déclenchement au 10e == golden.every (compteur 9 → reset)', () => {
    expect(MIG_0001).toContain('golden_counter >= 9');
    expect(GAME_CONFIG.booster.golden.every).toBe(10);
    expect(GAME_CONFIG.booster.golden.rateMultiplier).toBe(2);
  });

  it('recharge : +1 / 6 min (360 s) cap 10 == config.booster.recharge', () => {
    expect(MIG_0001).toContain('/ 360.0');
    expect(MIG_0001).toContain('least(10,');
    expect(GAME_CONFIG.booster.recharge.intervalMinutes).toBe(6);
    expect(GAME_CONFIG.booster.recharge.maxStock).toBe(10);
  });

  it('points premium : +1 par tranche de 100 == premium.cardsPerPoint', () => {
    expect(MIG_0001).toContain('/ 100)'); // (count+1)/100 - count/100
    expect(GAME_CONFIG.premium.cardsPerPoint).toBe(100);
    expect(GAME_CONFIG.premium.boosterPrice).toBe(10);
  });

  it('seuils visuels print : config couvre #1 / 2-10 / 11-100 / 101+', () => {
    expect(printVisualTier(1)).toBe('first');
    expect(printVisualTier(2)).toBe('gold');
    expect(printVisualTier(10)).toBe('gold');
    expect(printVisualTier(11)).toBe('silver');
    expect(printVisualTier(100)).toBe('silver');
    expect(printVisualTier(101)).toBe('standard');
    expect(printVisualTier(50_000)).toBe('standard');
  });
});

// --- Écarts corrigés (0008) : gardes de non-régression statiques -----------

describe('écarts corrigés (migration 0008) — gardes statiques SQL ↔ config', () => {
  // P1 — QA_REPORT #E-02 corrigé (0008) : toggle_wishlist lève WISHLIST_FULL
  // au-delà du cap, porté en paramètre DEFAULT aligné sur lib/config.ts
  // (wishlist.maxSlots = 10).
  it('cap wishlist : WISHLIST_FULL levé, p_max_slots DEFAULT == config.wishlist.maxSlots', () => {
    const body = MIG_0008.slice(
      MIG_0008.indexOf('create or replace function public.toggle_wishlist'),
    );
    expect(body).toContain("raise exception 'WISHLIST_FULL'");
    expect(body).toContain('p_max_slots int default 10');
    expect(GAME_CONFIG.wishlist.maxSlots).toBe(10);
  });

  // P1 — QA_REPORT #E-03 corrigé (0008) : la table de récompense de streak
  // vit en paramètres SQL DEFAULT dupliqués de lib/config.ts (chakraByDay
  // indexé J1→J7, palier cosmétique au jour cosmeticRewardDay).
  it('streak : DEFAULT SQL == config.streak.chakraByDay + palier cosmétique', () => {
    expect(MIG_0008).toContain("p_chakra_by_day int[] default '{20,25,30,40,50,65,0}'");
    expect(MIG_0008).toContain('p_cosmetic_reward_day int default 7');
    expect([...GAME_CONFIG.streak.chakraByDay]).toEqual([20, 25, 30, 40, 50, 65, 0]);
    expect(GAME_CONFIG.streak.cosmeticRewardDay).toBe(7);
  });

  // P0 — QA_REPORT #E-01 corrigé (0008) : la garde d'autorisation
  // `_assert_self` (auth.uid() NULL = service_role inchangé, sinon
  // p_user = auth.uid() sous peine de 'FORBIDDEN') est appliquée EN TÊTE de
  // chaque RPC publique prenant p_user — mutations ET lectures privées.
  it('garde E-01 : _assert_self en tête de TOUTES les RPC p_user', () => {
    const guarded = [
      'open_booster',
      'open_premium_booster',
      'claim_daily_pack',
      'burn_card',
      'update_quest_progress',
      'ensure_daily_quests',
      'claim_quests',
      'update_login_streak',
      'buy_cosmetic',
      'apply_cosmetic',
      'reroll_cosmetic',
      'toggle_wishlist',
      'get_booster_state',
      'get_collection_page',
      'get_album',
      'get_card_detail',
      'get_daily_quests',
      'get_wishlist',
      'get_theme_pool_info',
      'set_username',
      'set_showcase',
    ];
    for (const fn of guarded) {
      const marker = `create or replace function public.${fn}(`;
      const idx = MIG_0008.indexOf(marker);
      expect(idx, fn).toBeGreaterThanOrEqual(0);
      expect(MIG_0008.slice(idx, idx + 2500), fn).toContain('perform public._assert_self(p_user);');
    }
    // Les anciennes signatures (sans garde) sont supprimées, pas abandonnées.
    expect(MIG_0008).toContain('drop function if exists public.toggle_wishlist(uuid, uuid);');
    expect(MIG_0008).toContain('drop function if exists public.update_login_streak(uuid);');
  });

  // P1 — QA_REPORT #E-04 corrigé (0008) : possession vérifiée AVANT débit
  // (buy) ; le tirage de reroll exclut l'inventaire du joueur.
  it('shop E-04 : ALREADY_OWNED levé AVANT le débit ; reroll exclut l\'inventaire', () => {
    const buy = MIG_0008.slice(MIG_0008.indexOf('create or replace function public.buy_cosmetic'));
    expect(buy).toContain("raise exception 'ALREADY_OWNED'");
    expect(buy.indexOf('ALREADY_OWNED')).toBeLessThan(buy.indexOf('INSUFFICIENT_CHAKRA'));
    const reroll = MIG_0008.slice(MIG_0008.indexOf('create or replace function public.reroll_cosmetic'));
    expect(reroll).toContain('and not exists (select 1 from public.user_cosmetics');
  });

  // P1 — QA_REPORT #E-07 corrigé (0008) : la rareté la plus haute est lue
  // via characters.base_rarity (user_cards n'a pas de colonne rarity).
  it('profil public E-07 : jointure characters.base_rarity (plus de uc.rarity)', () => {
    const p = MIG_0008.slice(MIG_0008.indexOf('create or replace function public.get_public_profile'));
    expect(p).toContain('join public.characters as c on c.id = uc.character_id');
    expect(p).not.toContain('uc.rarity');
  });

  // P2 — QA_REPORT #E-05 corrigé (0008) : le daily pack (Épique min) progresse
  // la quête obtain_epic_plus.
  it('daily pack E-05 : progression obtain_epic_plus présente', () => {
    const d = MIG_0008.slice(MIG_0008.indexOf('create or replace function public.claim_daily_pack'));
    expect(d).toContain("public.update_quest_progress(p_user, 'obtain_epic_plus', v_epic_plus)");
  });

  // P1 — QA_REPORT #E-08 corrigé (0008) : grants service_role du cloud
  // explicités (purge physique des fixtures = DELETE characters accordé).
  it('grants service_role E-08 : tables des scripts grantées (DELETE characters)', () => {
    expect(MIG_0008).toContain('grant delete on public.characters to service_role;');
    expect(MIG_0008).toContain('grant select, insert, update on public.profiles to service_role;');
  });

  // P2 — QA_REPORT #E-06 : booster MIX toujours non câblé (décision V1 du
  // HANDOFF C toujours en suspens — HORS périmètre du hotfix 0008).
  it.fails('booster MIX : thème mix seedé + branche RPC dédiée', () => {
    const seed = readFileSync('supabase/migrations/0002_seed.sql', 'utf8');
    expect(seed).toContain("'mix'");
    expect(MIG_0001).toMatch(/p_theme_slug\s*=\s*'mix'/i);
  });
});
