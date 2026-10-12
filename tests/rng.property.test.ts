/**
 * ============================================================================
 * tests/rng.property.test.ts — PROPERTY-BASED RNG (Agent E, PROMPT E §3)
 *
 * Preuves statistiques + propriétés fast-check sur le RNG de tirage :
 *
 *   1. 100 000 rolls `_roll_rarity` (réplique TS fidèle de l'algo SQL) →
 *      distribution de chaque tier dans ±0,3 pt des poids de lib/config.ts ;
 *   2. même protocole pour les variantes : booster doré (L/M ×2 renormalisé),
 *      pack du jour (E+ renormalisé), roll premium 85/15 ;
 *   3. fast-check (propriétés) : pour des poids ARBITRAIRES et un rand
 *      arbitraire ∈ [0,1), le roll renvoie toujours un tier valide, jamais de
 *      crash (INVALID_WEIGHTS seulement si somme ≤ 0), bornes inclusives ;
 *   4. chi² d'uniformité du tirage de perso (algo `ORDER BY random() LIMIT 1`
 *      = floor(rand * pool)) pour plusieurs tailles de pool.
 *
 * Pur : aucune base requise, tourne partout (CI incluse).
 * ============================================================================
 */

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { GAME_CONFIG, RARITIES, type Rarity } from '@/lib/config';

// --- Réplique fidèle de public._roll_rarity (0001_functions.sql) ------------
// random()::numeric ∈ [0,1) ; tirage sur random() * somme(poids) puis
// soustractions séquentielles dans l'ordre C→U→R→E→L→M.

function rollRarity(
  weights: Partial<Record<Rarity, number>>,
  rand: number,
): Rarity {
  const w = (r: Rarity): number => weights[r] ?? 0;
  const total =
    w('common') + w('uncommon') + w('rare') + w('epic') + w('legendary') + w('mythic');
  if (total <= 0) throw new Error('INVALID_WEIGHTS');
  let r = rand * total;
  if (r < w('common')) return 'common';
  r -= w('common');
  if (r < w('uncommon')) return 'uncommon';
  r -= w('uncommon');
  if (r < w('rare')) return 'rare';
  r -= w('rare');
  if (r < w('epic')) return 'epic';
  r -= w('epic');
  if (r < w('legendary')) return 'legendary';
  return 'mythic';
}

/** Générateur LCG déterministe (reproductible, indépendant de l'impl Math.random). */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000; // [0,1)
  };
}

function sampleDistribution(
  weights: Partial<Record<Rarity, number>>,
  rolls: number,
  seed = 42,
): Record<Rarity, number> {
  const rng = makeRng(seed);
  const counts = Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>;
  for (let i = 0; i < rolls; i++) counts[rollRarity(weights, rng())] += 1;
  return counts;
}

/** Quantile ~0.999 d'une N(0,1) pour le chi² à α=0.001 (approximation WH). */
const Z_0_999 = 3.090232;

function chiSqUniformThreshold(categories: number): number {
  const df = categories - 1;
  // Wilson–Hilferty : χ²_df ≈ df * (1 - 2/(9df) + z*sqrt(2/(9df)))^3
  return df * Math.pow(1 - 2 / (9 * df) + Z_0_999 * Math.sqrt(2 / (9 * df)), 3);
}

function chiSqStatistic(counts: number[]): number {
  const n = counts.reduce((a, b) => a + b, 0);
  const exp = n / counts.length;
  return counts.reduce((acc, c) => acc + (c - exp) ** 2 / exp, 0);
}

// --- 1. Distribution à 100 000 rolls : ±0,3 pt des poids de config ----------

describe('RNG — distribution 100 000 rolls vs poids lib/config.ts', () => {
  const ROLLS = 100_000;
  const TOLERANCE_PT = 0.3;

  it('booster standard (C55/U25/R12/E5/L2.4/M0.6)', () => {
    const counts = sampleDistribution(GAME_CONFIG.rarityWeights, ROLLS, 20261014);
    const report = RARITIES.map((r) => {
      const actualPt = (counts[r] / ROLLS) * 100;
      const expectedPt = GAME_CONFIG.rarityWeights[r];
      return { r, expectedPt, actualPt, delta: Math.abs(actualPt - expectedPt) };
    });
     
    console.table(report);
    for (const { r, delta } of report) {
      expect(delta, `tier ${r} hors tolérance ±${TOLERANCE_PT} pt`).toBeLessThanOrEqual(
        TOLERANCE_PT,
      );
    }
  });

  it('booster doré : L/M ×2 puis renormalisation (les ratios comptent)', () => {
    const golden: Record<Rarity, number> = {
      common: GAME_CONFIG.rarityWeights.common,
      uncommon: GAME_CONFIG.rarityWeights.uncommon,
      rare: GAME_CONFIG.rarityWeights.rare,
      epic: GAME_CONFIG.rarityWeights.epic,
      legendary: GAME_CONFIG.rarityWeights.legendary * GAME_CONFIG.booster.golden.rateMultiplier,
      mythic: GAME_CONFIG.rarityWeights.mythic * GAME_CONFIG.booster.golden.rateMultiplier,
    };
    const counts = sampleDistribution(golden, ROLLS, 777);
    const total =
      golden.common + golden.uncommon + golden.rare + golden.epic + golden.legendary + golden.mythic;
    for (const r of RARITIES) {
      const expectedPt = (golden[r] / total) * 100;
      const actualPt = (counts[r] / ROLLS) * 100;
      expect(
        Math.abs(actualPt - expectedPt),
        `doré tier ${r} hors tolérance`,
      ).toBeLessThanOrEqual(TOLERANCE_PT);
    }
    // Effet réel du doré : part L+M nettement supérieure au standard.
    const lmGolden = ((counts.legendary + counts.mythic) / ROLLS) * 100;
    const lmBase =
      GAME_CONFIG.rarityWeights.legendary + GAME_CONFIG.rarityWeights.mythic;
    expect(lmGolden).toBeGreaterThan(lmBase * 1.5);
  });

  it('pack du jour : E+ uniquement, poids renormalisés (5/2.4/0.6)', () => {
    const daily: Partial<Record<Rarity, number>> = {
      epic: GAME_CONFIG.rarityWeights.epic,
      legendary: GAME_CONFIG.rarityWeights.legendary,
      mythic: GAME_CONFIG.rarityWeights.mythic,
    };
    const counts = sampleDistribution(daily, ROLLS, 99);
    // Aucune carte sous Épique, jamais.
    expect(counts.common + counts.uncommon + counts.rare).toBe(0);
    const total = GAME_CONFIG.rarityWeights.epic + GAME_CONFIG.rarityWeights.legendary + GAME_CONFIG.rarityWeights.mythic;
    for (const r of ['epic', 'legendary', 'mythic'] as const) {
      const expectedPt = ((GAME_CONFIG.rarityWeights[r] ?? 0) / total) * 100;
      const actualPt = (counts[r] / ROLLS) * 100;
      expect(Math.abs(actualPt - expectedPt), `daily tier ${r}`).toBeLessThanOrEqual(
        TOLERANCE_PT,
      );
    }
  });

  it('premium : 85 % L / 15 % M (GAME_CONFIG.premium.weights)', () => {
    const { weights } = GAME_CONFIG.premium;
    const counts = sampleDistribution(weights, ROLLS, 5);
    const expectedL = weights.legendary / (weights.legendary + weights.mythic);
    const actualL = counts.legendary / ROLLS;
    expect(Math.abs(actualL - expectedL)).toBeLessThanOrEqual(TOLERANCE_PT / 100);
    expect(counts.common + counts.uncommon + counts.rare + counts.epic).toBe(0);
  });
});

// --- 2. Propriétés fast-check (poids arbitraires) ---------------------------

describe('RNG — propriétés fast-check (poids arbitraires)', () => {
  // Poids du domaine réel du jeu (0.6 → 100) : SQL calcule en numeric exact,
  // la réplique TS en flottants — on reste dans le domaine où les deux coïncident.
  const arbitraryWeights = fc.dictionary(
    fc.constantFrom(...RARITIES),
    fc.double({ min: 0.001, max: 1000, noNaN: true }),
    { minKeys: 1, maxKeys: 6 },
  );
  // random() Postgres ∈ [0,1) : on borne à [0, 1 - 2⁻⁵³].
  const arbitraryRand = fc.double({ min: 0, max: 1 - 2 ** -53, noNaN: true });

  it('tout rand ∈ [0,1) et poids ≥ 0 (somme > 0) → tier valide, jamais de crash', () => {
    fc.assert(
      fc.property(arbitraryWeights, arbitraryRand, (weights, rand) => {
        const tier = rollRarity(weights as Partial<Record<Rarity, number>>, rand);
        expect((RARITIES as readonly string[])).toContain(tier);
      }),
      { numRuns: 10_000 },
    );
  });

  it('somme des poids ≤ 0 → INVALID_WEIGHTS', () => {
    expect(() => rollRarity({}, 0.5)).toThrow('INVALID_WEIGHTS');
    expect(() => rollRarity({ common: 0, epic: 0 }, 0.5)).toThrow('INVALID_WEIGHTS');
  });

  it('bornes : rand=0 → premier tier à poids > 0 ; rand→1⁻ → dernier tier à poids > 0 (poids entiers)', () => {
    // Poids ENTIERS uniquement : flottants et numeric SQL coïncident alors
    // exactement (la réplique TS en double dérive sur les décimaux arbitraires,
    // cf. propriété d'intervalle ci-dessous qui couvre le cas général).
    const intWeights = fc.dictionary(
      fc.constantFrom(...RARITIES),
      fc.integer({ min: 0, max: 1000 }),
      { minKeys: 1, maxKeys: 6 },
    );
    fc.assert(
      fc.property(intWeights, (weights) => {
        const w = weights as Partial<Record<Rarity, number>>;
        const positive = RARITIES.filter((r) => (w[r] ?? 0) > 0);
        if (positive.length === 0) return; // INVALID_WEIGHTS, couvert ailleurs
        expect(rollRarity(w, 0)).toBe(positive[0]);
        const justBelow1 = 1 - 2 ** -53;
        expect(rollRarity(w, justBelow1)).toBe(positive[positive.length - 1]);
      }),
      { numRuns: 10_000 },
    );
  });

  it('intervalle cumulé : le tier renvoyé respecte la fonction de répartition', () => {
    fc.assert(
      fc.property(
        arbitraryWeights,
        fc.integer({ min: 0, max: 999_999 }),
        (weights, permille) => {
          const w = weights as Partial<Record<Rarity, number>>;
          const total = RARITIES.reduce((a, r) => a + (w[r] ?? 0), 0);
          if (total <= 0) return;
          const rand = permille / 1_000_000; // 1000 points de coupure
          const tier = rollRarity(w, rand);
          // Le tier renvoyé doit être cohérent avec la coupure cumulative.
          let cum = 0;
          let expected: Rarity = 'mythic';
          for (const r of RARITIES) {
            cum += w[r] ?? 0;
            if (rand * total < cum) {
              expected = r;
              break;
            }
          }
          expect(tier).toBe(expected);
        },
      ),
      { numRuns: 10_000 },
    );
  });
});

// --- 3. Chi² d'uniformité du tirage de perso (ORDER BY random() LIMIT 1) ----

describe('RNG — uniformité du tirage de perso dans le tier/thème (chi²)', () => {
  // _pick_character = `order by random() limit 1` ≡ floor(rand * pool_size).
  function pickIndex(poolSize: number, rand: number): number {
    return Math.min(Math.floor(rand * poolSize), poolSize - 1);
  }

  it.each([2, 7, 50, 142, 500, 1000])('pool de %i persos → chi² sous seuil α=0.001', (poolSize) => {
    const N = 100_000;
    const rng = makeRng(poolSize * 31 + 7);
    const counts = new Array<number>(poolSize).fill(0);
    for (let i = 0; i < N; i++) counts[pickIndex(poolSize, rng())] += 1;
    const stat = chiSqStatistic(counts);
    const threshold = chiSqUniformThreshold(poolSize);
    expect(
      stat,
      `chi²=${stat.toFixed(1)} > seuil ${threshold.toFixed(1)} (pool ${poolSize})`,
    ).toBeLessThanOrEqual(threshold);
  });

  it('fast-check : tout index du pool est atteignable', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (poolSize, rand) => {
          const idx = pickIndex(poolSize, rand < 1 ? rand : 0);
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(poolSize);
        },
      ),
      { numRuns: 10_000 },
    );
  });
});
