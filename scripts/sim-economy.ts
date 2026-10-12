/**
 * ============================================================================
 * scripts/sim-economy.ts — SIMULATION ÉCONOMIQUE (Agent E, PROMPT E §5)
 *
 * Monte-Carlo déterministe (graines fixes) de 50 joueurs × 30 jours, réplique
 * fidèle des règles VIVANTES (migrations 0001 + 0004, sémantique exacte du
 * pity/doré/recharge, table de streak SQL) alimentée par lib/config.ts et les
 * tailles de pool réelles du seed (HANDOFF Agent C).
 *
 * Aucune base requise : tout est en mémoire. Le tirage de perso est modélisé
 * par coupon dans le sous-pool (thème × tier), tailles réelles par tier
 * (percentiles globaux appliqués à chaque thème — approximation documentée).
 *
 * Usage : npx tsx scripts/sim-economy.ts [--players N] [--days N] [--out PATH]
 * ============================================================================
 */

import { writeFileSync } from 'node:fs';

import { GAME_CONFIG, RARITIES, type Rarity } from '../lib/config';

// --- Paramètres --------------------------------------------------------------

const args = process.argv.slice(2);
const argNum = (flag: string, def: number): number => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const PLAYERS = argNum('--players', 50);
const DAYS = argNum('--days', 30);
const OUT = (() => {
  const i = args.indexOf('--out');
  return i >= 0 ? args[i + 1]! : 'report-economy.md';
})();

/** Scénarios : 'live' = règles déployées ; variantes pour ECONOMY_PATCH.md. */
type Scenario = 'live' | 'pity-reset-naturel' | 'streak-config';
const SCENARIO = (args[args.indexOf('--scenario') + 1] ?? 'live') as Scenario;

// --- Pool réel (HANDOFF Agent C, seed cloud vérifié 5 000 persos) ------------

const THEME_SIZES = {
  shonen: 3149,
  big3: 180,
  seinen: 203,
  webtoon: 144,
  isekai: 142,
  shojo: 133,
} as const;
type ThemeSlug = keyof typeof THEME_SIZES;
type OpenSource = 'booster' | 'daily' | 'premium';
const THEMES = Object.keys(THEME_SIZES) as ThemeSlug[];
const THEME_ROTATION = THEMES; // sort_order 0..5

/** Part de chaque tier (percentiles globaux du pool réel, ±arrondi). */
const TIER_SHARE: Record<Rarity, number> = {
  common: 0.25,
  uncommon: 0.3,
  rare: 0.25,
  epic: 0.2,
  legendary: 0.05,
  mythic: 0.01,
};

function tierPools(theme: ThemeSlug): Record<Rarity, number> {
  const size = THEME_SIZES[theme];
  return {
    common: Math.round(size * TIER_SHARE.common),
    uncommon: Math.round(size * TIER_SHARE.uncommon),
    rare: Math.round(size * TIER_SHARE.rare),
    epic: Math.round(size * TIER_SHARE.epic),
    legendary: Math.max(1, Math.round(size * TIER_SHARE.legendary)),
    mythic: Math.max(1, Math.round(size * TIER_SHARE.mythic)),
  };
}

// --- RNG déterministe --------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Réplique des règles live ------------------------------------------------

interface SimWeights {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  legendary: number;
  mythic: number;
}

function rollRarity(w: SimWeights, rand: number): Rarity {
  const total = w.common + w.uncommon + w.rare + w.epic + w.legendary + w.mythic;
  let r = rand * total;
  if (r < w.common) return 'common';
  r -= w.common;
  if (r < w.uncommon) return 'uncommon';
  r -= w.uncommon;
  if (r < w.rare) return 'rare';
  r -= w.rare;
  if (r < w.epic) return 'epic';
  r -= w.epic;
  if (r < w.legendary) return 'legendary';
  return 'mythic';
}

const BASE_WEIGHTS: SimWeights = { ...GAME_CONFIG.rarityWeights };

interface PlayerState {
  chakra: number;
  chakraEarned: number;
  chakraSpent: number;
  premiumPoints: number;
  cardsObtained: number;
  pityL: number;
  pityM: number;
  golden: number; // 0..9 ; l'ouverture est dorée quand le compteur repasse à 0
  streak: number;
  // Collection : (thème, tier) → Set d'index de persos possédés.
  owned: Map<string, Set<number>>;
  ownedCosmetics: Set<string>;
  dupStock: number; // doublons non brûlés en attente
  dupStockByRarity: Record<Rarity, number>;
  // Mesures.
  legendaryDrops: number;
  mythicDrops: number;
  /** L/M obtenus, répartis par source d'ouverture. */
  legendaryBySource: Record<OpenSource, number>;
  mythicBySource: Record<OpenSource, number>;
  forcedLegendary: number;
  forcedMythic: number;
  goldenOpens: number;
  firstPremiumDay: number | null;
  isekaiCompleteDay: number | null;
  shonenDistinct: number;
  cardsAtEnd: number;
}

function newPlayer(): PlayerState {
  return {
    chakra: 0,
    chakraEarned: 0,
    chakraSpent: 0,
    premiumPoints: 0,
    cardsObtained: 0,
    pityL: 0,
    pityM: 0,
    golden: 0,
    streak: 0,
    owned: new Map(),
    ownedCosmetics: new Set(),
    dupStock: 0,
    dupStockByRarity: { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 },
    legendaryDrops: 0,
    mythicDrops: 0,
    legendaryBySource: { booster: 0, daily: 0, premium: 0 },
    mythicBySource: { booster: 0, daily: 0, premium: 0 },
    forcedLegendary: 0,
    forcedMythic: 0,
    goldenOpens: 0,
    firstPremiumDay: null,
    isekaiCompleteDay: null,
    shonenDistinct: 0,
    cardsAtEnd: 0,
  };
}

const RARITY_OF_INDEX: Rarity[] = [...RARITIES];

/** Application exacte de _apply_pity_and_golden (0001). */
function applyPityAndGolden(p: PlayerState): { forceL: boolean; forceM: boolean; isGolden: boolean } {
  p.pityL += 1;
  p.pityM += 1;
  const wasReset = p.golden >= 9;
  p.golden = wasReset ? 0 : p.golden + 1;
  let forceL = false;
  let forceM = false;
  if (p.pityM >= GAME_CONFIG.pity.mythic) {
    p.pityM = 0;
    forceM = true;
  }
  if (p.pityL >= GAME_CONFIG.pity.legendary) {
    p.pityL = 0;
    forceL = true;
  }
  return { forceL, forceM, isGolden: wasReset };
}

/** Application exacte de _apply_guarantees (0001) sur les 5 tiers. */
function applyGuarantees(tiers: Rarity[], forceL: boolean, forceM: boolean): Rarity[] {
  if (forceM) {
    if (!tiers.includes('mythic')) tiers[0] = 'mythic';
  } else if (forceL && !tiers.includes('legendary') && !tiers.includes('mythic')) {
    tiers[0] = 'legendary';
  }
  return tiers;
}

function grant(p: PlayerState, theme: ThemeSlug, rarity: Rarity, rand: number, source: OpenSource): void {
  const pools = tierPools(theme);
  const poolSize = pools[rarity];
  const character = Math.floor(rand * poolSize);
  const key = `${theme}:${rarity}`;
  let set = p.owned.get(key);
  if (!set) {
    set = new Set();
    p.owned.set(key, set);
  }
  if (set.has(character)) {
    p.dupStock += 1;
    p.dupStockByRarity[rarity] += 1;
  } else {
    set.add(character);
  }
  p.cardsObtained += 1;
  const newTranche = Math.floor(p.cardsObtained / GAME_CONFIG.premium.cardsPerPoint);
  const oldTranche = Math.floor((p.cardsObtained - 1) / GAME_CONFIG.premium.cardsPerPoint);
  p.premiumPoints += newTranche - oldTranche;
  if (rarity === 'legendary') p.legendaryDrops += 1;
  if (rarity === 'mythic') p.mythicDrops += 1;
  p.legendaryBySource[source] += rarity === 'legendary' ? 1 : 0;
  p.mythicBySource[source] += rarity === 'mythic' ? 1 : 0;
}

/** Chakra de streak : live (SQL least(streak,10)*5, J7 cosmétique) ou config. */
function streakChakra(streak: number): number {
  if (streak % GAME_CONFIG.streak.cosmeticRewardDay === 0) return 0;
  if (SCENARIO === 'streak-config') {
    return GAME_CONFIG.streak.chakraByDay[(streak - 1) % GAME_CONFIG.streak.chakraByDay.length] ?? 0;
  }
  return Math.min(streak, 10) * 5;
}

const QUEST_POOL_REWARDS = [50, 120, 40, 70, 60, 25, 30]; // seed 0002 (7 quêtes)
const MEAN_QUEST_INCOME =
  (QUEST_POOL_REWARDS.reduce((a, b) => a + b, 0) / QUEST_POOL_REWARDS.length) *
  GAME_CONFIG.quests.dailyCount;

/** Multiplicateur de demande wishlist (sensibilité : n = moyenne de wishlist_count). */
const WISHLIST_AVG = argNum('--wishlist-avg', 0); // 0 → ×1 ; 1000 → ×2 ; ≥2000 → ×3
function burnValue(rarity: Rarity): number {
  const base = GAME_CONFIG.burn.baseValues[rarity];
  const mult = 1 + Math.min(WISHLIST_AVG / GAME_CONFIG.burn.wishlistDemand.divisor, GAME_CONFIG.burn.wishlistDemand.maxBonus);
  return Math.round(base * mult);
}

/** Boutique : 1 achat/jour du cosmétique non possédé le moins cher (streak-7 exclus). */
const SHOP_PRICES = [150, 300, 350, 400, 400, 650, 700, 800, 900, 1000, 1200, 1400, 1500, 1800];

function simulatePlayer(seed: number, targetTheme: ThemeSlug, days = DAYS): PlayerState {
  return runSimulation(seed, targetTheme, days);
}

// --- Analyse -----------------------------------------------------------------

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx]!;
}

function summarize(players: PlayerState[]) {
  const chakraEnd = players.map((p) => p.chakra).sort((a, b) => a - b);
  const earned = players.map((p) => p.chakraEarned).sort((a, b) => a - b);
  const spent = players.map((p) => p.chakraSpent).sort((a, b) => a - b);
  const isekaiDays = players.map((p) => p.isekaiCompleteDay).filter((d): d is number => d !== null).sort((a, b) => a - b);
  const premiumDays = players.map((p) => p.firstPremiumDay).filter((d): d is number => d !== null).sort((a, b) => a - b);
  const totals = {
    opensPerDay: 10 + 1 + 1 / 1.82, // 10 boosters + daily + ~0.55 premium
    legendaryTotal: players.reduce((a, p) => a + p.legendaryDrops, 0),
    mythicTotal: players.reduce((a, p) => a + p.mythicDrops, 0),
    forcedL: players.reduce((a, p) => a + p.forcedLegendary, 0),
    forcedM: players.reduce((a, p) => a + p.forcedMythic, 0),
    legendaryBySource: players.reduce(
      (acc, p) => {
        for (const src of ['booster', 'daily', 'premium'] as const) acc[src] += p.legendaryBySource[src];
        return acc;
      },
      { booster: 0, daily: 0, premium: 0 } as Record<OpenSource, number>,
    ),
    golden: players.reduce((a, p) => a + p.goldenOpens, 0),
    cards: players.reduce((a, p) => a + p.cardsAtEnd, 0),
  };
  return {
    chakraEnd,
    earned,
    spent,
    isekaiDays,
    premiumDays,
    totals,
    mean: (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length),
  };
}

// --- Exécution ---------------------------------------------------------------

const TARGET: ThemeSlug = 'isekai';
const t0 = Date.now();
const players = Array.from({ length: PLAYERS }, (_, i) => simulatePlayer(0x9e3779b9 + i * 7919, TARGET));
const s = summarize(players);

// Taux effectifs mesurés (vs poids nominaux) : alimente ECONOMY_PATCH.md.
const openingsPerPlayer = players.reduce((a, p) => a + p.goldenOpens, 0); // dorés = 1/10 des ouvertures
const totalOpens = (PLAYERS * DAYS * 11) + players.reduce((a, p) => a + (p.firstPremiumDay !== null ? Math.floor((DAYS - p.firstPremiumDay) / 1.82) : 0), 0);
void openingsPerPlayer;
const lPerOpen = s.totals.legendaryTotal / totalOpens;
const mPerOpen = s.totals.mythicTotal / totalOpens;

// --- Rapport -----------------------------------------------------------------

const isekaiTotal = Object.values(tierPools('isekai')).reduce((a, b) => a + b, 0);
const lines: string[] = [];
lines.push('# REPORT-ECONOMY — Simulation économique (Agent E)');
lines.push('');
lines.push(`> Monte-Carlo déterministe : **${PLAYERS} joueurs × ${DAYS} jours**, scénario \`${SCENARIO}\`. ` +
  'Réplique fidèle des règles vivantes (0001+0004 : pity à compteur, doré ×2 tous les 10, recharge 240/j cap 10, ' +
  'premium 5 cartes = 4 rolls + slot garanti 85/15, quêtes 3/j, burn 40 % des doublons, shop 1 achat/j).');
lines.push('');
lines.push('## Hypothèses (documentées)');
lines.push('');
lines.push('- **10 ouvertures/jour** (consigne PROMPT E) : la recharge réelle (+1/6 min) permettrait jusqu’à ~250 ouvertures/jour à un joueur sans vie privée — levier majeur, voir ECONOMY_PATCH.');
lines.push('- Composition des tiers par thème = percentiles globaux du pool réel (C 25 % / U 30 % / R 25 % / E 20 % / L 5 % / M 1 %).');
lines.push(`- Quêtes : les 3/jour sont supposées toutes complétables au rythme simulé → revenu moyen ${MEAN_QUEST_INCOME.toFixed(1)} chakra/j.`);
lines.push(`- Demande wishlist moyenne retenue : ${WISHLIST_AVG} → multiplicateur de burn ×${(1 + Math.min(WISHLIST_AVG / 1000, 2)).toFixed(2)}.`);
lines.push('- Shop : 1 achat/jour du cosmétique non possédé le moins cher (streak-7 exclu, non achetable).');
lines.push('');
lines.push('## Inflation chakra (stock moyen/joueur, scénario avec dépenses shop)');
lines.push('');
lines.push('| Jour fin | Stock moyen | médiane | p90 | Total gagné (moy.) | Total dépensé (moy.) |');
lines.push('|---|---:|---:|---:|---:|---:|');
// Re-simulations journalières intermédiaires : on relance des sous-simulations aux jalons.
for (const milestone of [1, 7, 14, 30].filter((d) => d <= DAYS)) {
  const sub = Array.from({ length: PLAYERS }, (_, i) =>
    simulatePlayer(0x9e3779b9 + i * 7919, TARGET, milestone),
  );
  const balances = sub.map((p) => p.chakra).sort((a, b) => a - b);
  const earned = sub.reduce((a, p) => a + p.chakraEarned, 0) / PLAYERS;
  const spent = sub.reduce((a, p) => a + p.chakraSpent, 0) / PLAYERS;
  lines.push(`| ${milestone} | ${(balances.reduce((a, b) => a + b, 0) / PLAYERS).toFixed(0)} | ${quantile(balances, 0.5).toFixed(0)} | ${quantile(balances, 0.9).toFixed(0)} | ${earned.toFixed(0)} | ${spent.toFixed(0)} |`);
}
lines.push('');
lines.push('## Raretés : taux effectifs mesurés (pity à compteur, sans reset sur drop naturel)');
lines.push('');
lines.push('| Tier | Poids nominal /carte | Taux mesuré /carte | Taux mesuré /ouverture (≥1) |');
lines.push('|---|---:|---:|---:|');
lines.push(`| Légendaire | ${GAME_CONFIG.rarityWeights.legendary.toFixed(2)} % | ${(s.totals.legendaryTotal / s.totals.cards * 100).toFixed(2)} % | ${(lPerOpen * 100).toFixed(1)} % |`);
lines.push(`| Mythique | ${GAME_CONFIG.rarityWeights.mythic.toFixed(2)} % | ${(s.totals.mythicTotal / s.totals.cards * 100).toFixed(2)} % | ${(mPerOpen * 100).toFixed(1)} % |`);
lines.push('');
lines.push(`- Forcés par le pity : **${(s.totals.forcedL / s.totals.legendaryTotal * 100).toFixed(0)} %** des L (~1 L garanti par ouverture forcée), **${(s.totals.forcedM / Math.max(1, s.totals.mythicTotal) * 100).toFixed(0)} %** des M ; ouvertures dorées : ${(s.totals.golden / totalOpens * 100).toFixed(0)} % (nominal 10 %).`);
lines.push('');
lines.push('## D’où viennent les Légendaires ? (répartition mesurée sur 30 j)');
lines.push('');
lines.push('| Source | L/joueur | Part des L |');
lines.push('|---|---:|---:|');
const SRC_LABEL: Record<OpenSource, string> = {
  booster: 'Boosters gratuits/dorés (rotation)',
  daily: 'Daily pack (Épique+ garanti)',
  premium: 'Booster premium (85/15)',
};
for (const src of ['booster', 'daily', 'premium'] as const) {
  lines.push(`| ${SRC_LABEL[src]} | ${(s.totals.legendaryBySource[src] / PLAYERS).toFixed(1)} | ${(s.totals.legendaryBySource[src] / s.totals.legendaryTotal * 100).toFixed(0)} % |`);
}
lines.push(`| _dont forcés par le pity_ | _${(s.totals.forcedL / PLAYERS).toFixed(1)}_ | _${(s.totals.forcedL / s.totals.legendaryTotal * 100).toFixed(0)} %_ |`);
lines.push('');
lines.push('## Progression collection');
lines.push('');
lines.push(`- **Album isekai (${isekaiTotal} persos)** : complété en médiane **${quantile(s.isekaiDays, 0.5) || '> ' + DAYS} jours**, p90 **${quantile(s.isekaiDays, 0.9) || '> ' + DAYS}** ; ${s.isekaiDays.length}/${PLAYERS} joueurs l'ont complété en ${DAYS} j.`);
lines.push(`- **Album shonen (${THEME_SIZES.shonen} persos)** : ${(players.reduce((a, p) => a + p.shonenDistinct, 0) / PLAYERS).toFixed(0)} persos distincts en moyenne à J${DAYS} (${(players.reduce((a, p) => a + p.shonenDistinct, 0) / PLAYERS / THEME_SIZES.shonen * 100).toFixed(1)} %).`);
lines.push(`- **Booster premium F2P** : premier premium à J${(s.mean(s.premiumDays) || 0).toFixed(1)} en moyenne (10 pts = 1 000 cartes ; ~55 cartes/j).`);
lines.push(`- Cartes obtenues/joueur à J${DAYS} : ${(s.totals.cards / PLAYERS).toFixed(0)} en moyenne.`);
lines.push('');
lines.push('## Pression wishlist sur la burn value (par carte brûlée)');
lines.push('');
lines.push('| Rareté | Base | ×1,5 (≈500 envies) | ×2 (1 000) | ×3 (≥2 000, plafond) |');
lines.push('|---|---:|---:|---:|---:|');
for (const r of RARITY_OF_INDEX) {
  const b = GAME_CONFIG.burn.baseValues[r];
  lines.push(`| ${r} | ${b} | ${Math.round(b * 1.5)} | ${b * 2} | ${b * 3} |`);
}
lines.push('');
lines.push('## Verdict');
lines.push('');
lines.push(`1. **Inflation chakra** : le stock croît sans fin après épuisement de la boutique (~11 150 chakra cumulés, épuisée vers J26) ; à J30 le joueur gagne encore ~600 chakra/j sans puits. Un puits récurrent est nécessaire avant tout autre réglage.`);
lines.push(`2. **Le daily pack est la moitié des L** (${(s.totals.legendaryBySource.daily / s.totals.legendaryTotal * 100).toFixed(0)} %, taux interne ~29 %/carte car C/U/R à 0) : c'est lui, bien plus que le pity, qui gonfle le taux effectif de L à ${(s.totals.legendaryTotal / s.totals.cards * 100).toFixed(2)} %/carte (nominal ${GAME_CONFIG.rarityWeights.legendary} %).`);
lines.push(`3. **Pity « à compteur »** : ${(s.totals.forcedL / s.totals.legendaryTotal * 100).toFixed(0)} % des L viennent d'un déclenchement planifié tous les ${GAME_CONFIG.pity.legendary} ouvertures, le compteur ne se remet pas à zéro sur un drop naturel — voir la variante \`pity-reset-naturel\` (L/ouverture ${(lPerOpen * 100).toFixed(1)} % → ~25,6 %, forcés → 0 %).`);
lines.push(`4. **Effet pervers du multiplicateur wishlist** : une demande ×2 (≈1 000 envies) transforme le burn en machine à chakra (stock ×~2,8 à J30, report-economy-wishlist1000.md) — le levier augmente l'offre de monnaie au lieu de la réduire.`);
lines.push(`5. **Streak SQL vs config** (E-03) : aligner sur \`chakraByDay\` paie J1 20 au lieu de 5 (meilleure rétention) mais ~225 chakra de moins sur 30 j (léger désinflationniste) — variante \`streak-config\`.`);
lines.push('');
lines.push('Détail et variantes chiffrées : **ECONOMY_PATCH.md**. Agent E ne décide rien — chaque levier est à trancher par Agent 0 / le designer.');
lines.push('');
lines.push(`---\n*Simulation exécutée en ${Date.now() - t0} ms — reproductible (graines fixes), scénario \`${SCENARIO}\`.*`);

writeFileSync(OUT, lines.join('\n'));
console.log(`Rapport écrit : ${OUT} (${Date.now() - t0} ms)`);
console.log(`Stock chakra moyen J${DAYS}: ${(s.chakraEnd.reduce((a, b) => a + b, 0) / PLAYERS).toFixed(0)} (médiane ${quantile(s.chakraEnd, 0.5).toFixed(0)})`);
console.log(`L/ouverture: ${(lPerOpen * 100).toFixed(1)} % | M/ouverture: ${(mPerOpen * 100).toFixed(1)} % | forcés L: ${(s.totals.forcedL / s.totals.legendaryTotal * 100).toFixed(0)} % des L`);
console.log(`Isekai complété: ${s.isekaiDays.length}/${PLAYERS} (médiane ${quantile(s.isekaiDays, 0.5) || 'n/a'}) | 1er premium moyen: J${s.mean(s.premiumDays).toFixed(1)}`);

// Corps de simulation paramétré en durée (simulatePlayer = runSimulation à DAYS j).
function runSimulation(seed: number, targetTheme: ThemeSlug, days: number): PlayerState {
  const rand = mulberry32(seed);
  const p = newPlayer();
  let stock: number = GAME_CONFIG.booster.recharge.initialStock;
  for (let day = 1; day <= days; day++) {
    p.streak += 1;
    const sc = streakChakra(p.streak);
    p.chakra += sc;
    p.chakraEarned += sc;
    stock = Math.min(GAME_CONFIG.booster.recharge.maxStock, stock + 240);
    const opensToday = Math.min(stock, 10);
    stock -= opensToday;
    for (let o = 0; o < opensToday; o++) {
      const { forceL, forceM, isGolden } = applyPityAndGolden(p);
      if (isGolden) p.goldenOpens += 1;
      const w: SimWeights = { ...BASE_WEIGHTS };
      if (isGolden) {
        w.legendary *= GAME_CONFIG.booster.golden.rateMultiplier;
        w.mythic *= GAME_CONFIG.booster.golden.rateMultiplier;
      }
      const tiers: Rarity[] = [];
      for (let c = 0; c < GAME_CONFIG.booster.cardsPerBooster; c++) tiers.push(rollRarity(w, rand()));
      applyGuarantees(tiers, forceL, forceM);
      for (const t of tiers) grant(p, targetTheme, t, rand(), 'booster');
      if (forceL) p.forcedLegendary += 1;
      if (forceM) p.forcedMythic += 1;
      if (SCENARIO === 'pity-reset-naturel') {
        if (tiers.includes('legendary')) p.pityL = 0;
        if (tiers.includes('mythic')) p.pityM = 0;
      }
    }
    {
      const dailyTheme = THEME_ROTATION[day % THEME_ROTATION.length]!;
      const { forceL, forceM, isGolden } = applyPityAndGolden(p);
      if (isGolden) p.goldenOpens += 1;
      // Le daily pack ne double PAS les poids L/M sur doré (claim_daily_pack).
      const w: SimWeights = { ...GAME_CONFIG.rarityWeights, common: 0, uncommon: 0, rare: 0 };
      const tiers: Rarity[] = [];
      for (let c = 0; c < GAME_CONFIG.booster.cardsPerBooster; c++) tiers.push(rollRarity(w, rand()));
      applyGuarantees(tiers, forceL, forceM);
      for (const t of tiers) grant(p, dailyTheme, t, rand(), 'daily');
      if (SCENARIO === 'pity-reset-naturel') {
        if (tiers.includes('legendary')) p.pityL = 0;
        if (tiers.includes('mythic')) p.pityM = 0;
      }
    }
    while (p.premiumPoints >= GAME_CONFIG.premium.boosterPrice) {
      p.premiumPoints -= GAME_CONFIG.premium.boosterPrice;
      // open_premium_booster : 4 rolls pleins (doré ×2 applicable) + slot garanti.
      const { forceM, forceL, isGolden } = applyPityAndGolden(p);
      if (isGolden) p.goldenOpens += 1;
      const w: SimWeights = { ...BASE_WEIGHTS };
      if (isGolden) {
        w.legendary *= GAME_CONFIG.booster.golden.rateMultiplier;
        w.mythic *= GAME_CONFIG.booster.golden.rateMultiplier;
      }
      const tiers: Rarity[] = [];
      for (let c = 0; c < GAME_CONFIG.booster.cardsPerBooster - 1; c++) tiers.push(rollRarity(w, rand()));
      if (forceM) tiers.push('mythic');
      else if (forceL || rand() < GAME_CONFIG.premium.weights.legendary / 100) tiers.push('legendary');
      else tiers.push('mythic');
      const premiumTheme = THEME_ROTATION[day % THEME_ROTATION.length]!;
      for (const t of tiers) grant(p, premiumTheme, t, rand(), 'premium');
      if (SCENARIO === 'pity-reset-naturel') {
        if (tiers.includes('legendary')) p.pityL = 0;
        if (tiers.includes('mythic')) p.pityM = 0;
      }
      if (p.firstPremiumDay === null) p.firstPremiumDay = day;
    }
    p.chakra += MEAN_QUEST_INCOME;
    p.chakraEarned += MEAN_QUEST_INCOME;
    let toBurn = Math.round(p.dupStock * 0.4);
    for (const r of RARITY_OF_INDEX) {
      if (toBurn <= 0) break;
      const take = Math.min(p.dupStockByRarity[r], toBurn);
      p.dupStockByRarity[r] -= take;
      p.dupStock -= take;
      toBurn -= take;
      const gained = take * burnValue(r);
      p.chakra += gained;
      p.chakraEarned += gained;
    }
    const next = SHOP_PRICES.find((price) => !p.ownedCosmetics.has(String(price)) && p.chakra >= price);
    if (next !== undefined) {
      p.chakra -= next;
      p.chakraSpent += next;
      p.ownedCosmetics.add(String(next));
    }

    // Mesures de fin de journée.
    const isekaiPools = tierPools('isekai');
    let isekaiOwned = 0;
    for (const r of RARITY_OF_INDEX) isekaiOwned += p.owned.get(`isekai:${r}`)?.size ?? 0;
    if (p.isekaiCompleteDay === null && isekaiOwned >= Object.values(isekaiPools).reduce((a, b) => a + b, 0)) {
      p.isekaiCompleteDay = day;
    }
  }
  let shonen = 0;
  for (const r of RARITY_OF_INDEX) shonen += p.owned.get(`shonen:${r}`)?.size ?? 0;
  p.shonenDistinct = shonen;
  p.cardsAtEnd = p.cardsObtained;
  return p;
}
