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

// --- Écarts connus (QA_REPORT) : documentés, CI verte, réactivation forcée ---

describe('écarts connus documentés (voir QA_REPORT.md)', () => {
  // P1 — QA_REPORT #E-02 : la RPC toggle_wishlist (0001) ne lève JAMAIS
  // WISHLIST_FULL : aucune part du corps ne vérifie le cap 10. Le standard
  // commun n°4/SPEC §3 exigent le cap ('WISHLIST_FULL'). `it.fails` = le test
  // PASSE tant que le trou existe ; il devient rouge dès que la RPC est corrigée.
  it.fails('cap wishlist 10 : la RPC lève WISHLIST_FULL au 11e ajout', () => {
    const body = MIG_0001.slice(
      MIG_0001.indexOf('create or replace function public.toggle_wishlist'),
    );
    expect(body).toContain("raise exception 'WISHLIST_FULL'");
  });

  // P1 — QA_REPORT #E-03 : table de récompense de streak divergente.
  // lib/config.ts : chakraByDay = [20,25,30,40,50,65,0] (J1→J7, J7 = cosmétique)
  // SQL 0001 update_login_streak : chakra = least(streak,10)*5 → 5,10,15,20,25,30
  // (J8+ : 40,45,50 puis plafond 50). Standard n°12 : la valeur en dur ailleurs
  // = refus de review. `it.fails` documente l'écart jusqu'à alignement.
  it.fails('streak : SQL == config.streak.chakraByDay (J1→J7)', () => {
    const sqlByDay = [1, 2, 3, 4, 5, 6].map((d) => Math.min(d, 10) * 5);
    expect(sqlByDay).toEqual([...GAME_CONFIG.streak.chakraByDay.slice(0, 6)]);
    // J7 : cosmétique dans les deux mondes (cosmeticRewardDay == % 7 == 0).
    expect(GAME_CONFIG.streak.cosmeticRewardDay).toBe(7);
  });

  // P2 — QA_REPORT #E-06 : booster MIX (décision V1, HANDOFF C) non câblé :
  // ni thème 'mix' au seed 0002, ni branche mix dans open_booster/_pick_character.
  it.fails('booster MIX : thème mix seedé + branche RPC dédiée', () => {
    const seed = readFileSync('supabase/migrations/0002_seed.sql', 'utf8');
    expect(seed).toContain("'mix'");
    expect(MIG_0001).toMatch(/p_theme_slug\s*=\s*'mix'/i);
  });
});
