/**
 * lib/config.ts — SOURCE UNIQUE DE VÉRITÉ de l'équilibrage de MANGA SOCIETY.
 *
 * Toute constante de jeu (poids de rareté, pity, recharge, burn, prix, seuils
 * visuels) vit ICI et nulle part ailleurs. Une valeur en dur dans une route,
 * un RPC ou un composant = refus de review (standard commun n°12).
 *
 * Les mêmes valeurs sont dupliquées côté SQL en paramètres avec DEFAULT des
 * RPC (jamais exposés au client), ce fichier reste la référence métier.
 */

/** Les 6 tiers de rareté du personnage, du plus courant au plus rare. */
export const RARITIES = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
] as const;

export type Rarity = (typeof RARITIES)[number];

/** Codes courts façon TCG (badges, filtres, affichage compact). */
export const RARITY_CODE: Record<Rarity, 'C' | 'U' | 'R' | 'E' | 'L' | 'M'> = {
  common: 'C',
  uncommon: 'U',
  rare: 'R',
  epic: 'E',
  legendary: 'L',
  mythic: 'M',
};

export const GAME_CONFIG = {
  /**
   * Poids de rareté au roll d'un booster, en POURCENTAGE.
   * Le perso tiré est uniforme DANS le tier ET dans le thème choisi.
   * La somme DOIT valoir exactement 100 (vérifié au chargement du module).
   * Ajustable : l'Agent E mesure l'inflation économique sur ces poids.
   */
  rarityWeights: {
    common: 55,
    uncommon: 25,
    rare: 12,
    epic: 5,
    legendary: 2.4,
    mythic: 0.6,
  },

  booster: {
    /**
     * Nombre de cartes par ouverture de booster gratuit (daily inclus).
     * Ne s'applique PAS au booster premium : 10 points = 1 carte Légendaire
     * minimum (cf. premium.minRarity / premium.weights, migration 0004).
     */
    cardsPerBooster: 5,

    /**
     * Recharge du stock de boosters gratuits :
     * +1 booster toutes les `intervalMinutes`, jamais au-delà de `maxStock`.
     * `initialStock` = stock à la création du profil.
     * La logique de recharge ne vit QUE dans la RPC (côté serveur).
     */
    recharge: {
      intervalMinutes: 6,
      maxStock: 10,
      initialStock: 10,
    },

    /**
     * Booster doré : toutes les `every` ouvertures (tous types confondus,
     * premium et daily compris), l'ouverture suivante est dorée et applique
     * `rateMultiplier` aux poids de rareté (les poids L/M peuvent dépasser
     * 100 en somme relatif, seuls les ratios comptent).
     */
    golden: {
      every: 10,
      rateMultiplier: 2,
    },
  },

  /**
   * Pity visible ("Légendaire garantie dans X boosters au plus") :
   * au bout de `legendary` boosters sans L, la prochaine ouverture en contient
   * au moins une (idem `mythic`). Un pity déclenché reset son compteur à 0.
   * Les ouvertures premium et daily COMPTENT dans le pity.
   */
  pity: {
    legendary: 25,
    mythic: 200,
  },

  /**
   * Pack du jour : gratuit, 1 par jour (minuit Europe/Paris), thème rotatif
   * déterministe par `sort_order` (nb de jours depuis epoch mod nb de thèmes).
   * Les 5 cartes sont rollées UNIQUEMENT dans les tiers `minRarity` et au-dessus
   * (poids renormalisés) → Épique minimum garantie.
   */
  dailyPack: {
    minRarity: 'epic' as Rarity,
  },

  /**
   * Burn de doublons → chakra. Valeur de base par rareté, multipliée par la
   * demande wishlist du perso : `1 + min(wishlist_count / divisor, maxBonus)`
   * (mécanique Karuta : brûler un perso convoité rapporte plus, bonus capé).
   */
  burn: {
    baseValues: {
      common: 5,
      uncommon: 8,
      rare: 15,
      epic: 30,
      legendary: 80,
      mythic: 200,
    },
    wishlistDemand: {
      divisor: 1000,
      maxBonus: 2,
    },
  },

  /**
   * Points premium (monnaie unique, jamais achetable) :
   * +`pointsPerTranche` point par tranche de `cardsPerPoint` cartes obtenues.
   * Le booster premium coûte `boosterPrice` points et garantit au minimum une
   * carte `minRarity` (roll interne pondéré par `weights`, en %).
   */
  premium: {
    cardsPerPoint: 100,
    pointsPerTranche: 1,
    boosterPrice: 10,
    minRarity: 'legendary' as Rarity,
    weights: {
      legendary: 85,
      mythic: 15,
    },
  },

  /** Wishlist : nombre maximum de persos enregistrés par joueur. */
  wishlist: {
    maxSlots: 10,
  },

  /** Quêtes : nombre de quêtes quotidiennes générées par jour (Europe/Paris). */
  quests: {
    dailyCount: 3,
  },

  /**
   * Seuils visuels du badge print (consommés par le composant carte de
   * l'Agent D) : parcourus dans l'ordre, le premier `upTo` ≥ print_number
   * l'emporte ; au-delà du dernier seuil le badge reste 'standard'.
   */
  printVisualTiers: {
    tiers: [
      { upTo: 1, tier: 'first' }, // print #1 : badge unique du tout premier détenteur
      { upTo: 10, tier: 'gold' }, // #2-10 : doré animé
      { upTo: 100, tier: 'silver' }, // #11-100 : argent
      { upTo: 500, tier: 'standard' }, // #101-500 : sobre
    ],
  },

  /**
   * Streak de connexion : appelé à chaque login (hier → +1 jour, aujourd'hui
   * → noop, trou → reset à 1). Le jour `cosmeticRewardDay` donne une
   * récompense cosmétique exclusive (pas de chakra ce jour-là).
   * `chakraByDay` = chakra offert par jour de streak, indexé de J1 à J7 —
   * TABLE DÉLIBÉRÉMENT SIMPLE ET AJUSTABLE (équilibrage à valider via la
   * simulation économique de l'Agent E).
   */
  streak: {
    cosmeticRewardDay: 7,
    chakraByDay: [20, 25, 30, 40, 50, 65, 0],
  },
} as const;

/** Type dérivé de la config entière (utilitaire pour les tests/mocks). */
export type GameConfig = typeof GAME_CONFIG;

/** Tier visuel d'un badge print, dérivé de la config. */
export type PrintVisualTier =
  (typeof GAME_CONFIG.printVisualTiers.tiers)[number]['tier'];

/**
 * Renvoie le tier visuel du badge pour un print_number donné
 * ('first' pour le #1, 'gold' 2-10, 'silver' 11-100, 'standard' au-delà).
 */
export function printVisualTier(printNumber: number): PrintVisualTier {
  for (const t of GAME_CONFIG.printVisualTiers.tiers) {
    if (printNumber <= t.upTo) return t.tier;
  }
  return 'standard';
}

/** Somme des poids de rareté — doit valoir exactement 100. */
export const RARITY_WEIGHTS_SUM = RARITIES.reduce(
  (acc, rarity) => acc + GAME_CONFIG.rarityWeights[rarity],
  0,
);

// Invariant d'équilibrage : un changement de poids qui casse la somme à 100
// fait planter l'app au démarrage plutôt que de déséquilibrer le jeu en silence.
if (Math.abs(RARITY_WEIGHTS_SUM - 100) > 1e-9) {
  throw new Error(
    `[config] La somme des poids de rareté vaut ${RARITY_WEIGHTS_SUM}, attendu 100.`,
  );
}

/**
 * Valeur de burn d'une carte : base par rareté × multiplicateur de demande
 * wishlist `1 + min(wishlist_count / divisor, maxBonus)`. Côté serveur
 * uniquement (la RPC fait le calcul en SQL, jamais le client).
 */
export function burnValueFor(rarity: Rarity, wishlistCount: number): number {
  const base = GAME_CONFIG.burn.baseValues[rarity];
  const { divisor, maxBonus } = GAME_CONFIG.burn.wishlistDemand;
  return Math.round(base * (1 + Math.min(wishlistCount / divisor, maxBonus)));
}
