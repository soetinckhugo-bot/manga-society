/**
 * types/api.ts — CONTRATS DE RÉPONSE de chaque route API.
 *
 * Les agents A (route handlers) et B (frontend) codent CONTRE ce fichier,
 * pas l'inverse. Toute incohérence constatée se signale en HANDOFF.md.
 *
 * Conventions :
 * - Dates = string ISO 8601 (timestamptz Postgres sérialisé).
 * - Erreurs = `{ error: AppErrorCode }` uniquement (lib/errors.ts) ; le client
 *   traduit via next-intl, le serveur ne formate jamais de message.
 * - Chaque handler répond `XxxResponse | ApiErrorBody` avec le statut HTTP
 *   donné par `httpStatusForError(code)`.
 * - Toute mutation d'économie prend une `idempotency_key` uuid générée par le
 *   client À CHAQUE tentative de clic (standard commun n°4).
 */
import type { Rarity } from '@/lib/config';
import type { AppErrorCode } from '@/lib/errors';
import type {
  OpenBoosterInput,
  OpenPremiumBoosterInput,
  ClaimDailyPackInput,
  BurnInput,
  ApplyCosmeticInput,
  RerollCosmeticInput,
  BuyCosmeticInput,
  ClaimQuestsInput,
  WishlistToggleInput,
} from '@/lib/validations';

// ---------------------------------------------------------------------------
// Types métier partagés
// ---------------------------------------------------------------------------

/** Corps d'erreur unique de toutes les routes : un code métier, jamais un message. */
export interface ApiErrorBody {
  error: AppErrorCode;
}

export type CosmeticType = 'frame' | 'holo' | 'dye';

/** Source d'obtention d'une carte (check constraint de user_cards.source). */
export type CardSource = 'booster' | 'premium' | 'daily' | 'quest';

/** Thème de booster (table themes). */
export interface ThemeDto {
  slug: string;
  name_fr: string;
  name_en: string;
  icon: string | null;
  pack_art_url: string | null;
  sort_order: number;
}

/**
 * Cosmétique (frame / holo / dye). Le rendu est 100 % piloté par
 * `css_config` (tokens CSS jsonb) — aucun code spécifique par cosmétique.
 */
export interface CosmeticDto {
  id: string;
  type: CosmeticType;
  name_fr: string;
  name_en: string;
  chakra_price: number;
  is_ultra_rare: boolean;
  css_config: Record<string, unknown>;
}

/** Résumé public d'un personnage (table characters, lecture publique). */
export interface CharacterSummaryDto {
  id: string;
  anilist_id: number | null;
  name_romaji: string;
  name_native: string | null;
  image_url: string;
  image_url_fallback: string | null;
  anime_title: string;
  base_rarity: Rarity;
  print_count: number;
  wishlist_count: number;
}

/**
 * Carte possédée (user_cards JOIN characters). `print_number` est le numéro
 * de print du PERSO (séquentiel par personnage, jamais recyclé, atomique),
 * `print_count` le nombre d'exemplaires existants de ce perso.
 */
export interface CardDto {
  id: string;
  character: CharacterSummaryDto;
  print_number: number;
  first_owner: boolean;
  frame: CosmeticDto | null;
  holo: CosmeticDto | null;
  dye: CosmeticDto | null;
  source: CardSource;
  obtained_at: string;
}

/** Carte telle que renvoyée par une ouverture : enrichie du flag "Nouveau". */
export interface OpenedCardDto extends CardDto {
  /** true si le joueur ne possédait pas encore ce perso avant le tirage. */
  is_new_character: boolean;
}

/** Quête quotidienne (user_quests du jour JOIN quests). */
export interface QuestDto {
  id: string;
  key: string;
  /** Type métier ('open_boosters', 'burn_cards', …) — clé de comptage côté RPC. */
  type: string;
  goal: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  chakra_reward: number;
  name_fr: string;
  name_en: string;
}

/** État complet du panneau boosters (GET /api/boosters/state). */
export interface BoosterStateDto {
  booster_count: number;
  max_stock: number;
  /** Prochaine recharge de stock ; null si le stock est plein. */
  next_recharge_at: string | null;
  recharge_interval_minutes: number;
  premium_points: number;
  chakra: number;
  /** Boosters restants avant garantie ("Légendaire garantie dans X"). */
  pity_legendary_left: number;
  pity_mythic_left: number;
  /** Boosters ouverts depuis le dernier doré (affiché "X/10"). */
  golden_counter: number;
  golden_every: number;
  daily_pack: {
    available: boolean;
    theme: ThemeDto | null;
    /** Minuit Europe/Paris du prochain reset ; null si déjà claim. */
    next_reset_at: string | null;
  };
  /** Les 3 quêtes du jour pour le widget du panneau boosters. */
  quest_widget: QuestDto[];
  /** Jour actuel de la streak (0 = pas de streak, 1-7). */
  login_streak: number;
}

/** Page de collection paginée par curseur (pas d'offset). */
export interface CollectionPageDto {
  items: CardDto[];
  /** Curseur opaque vers la page suivante ; null = fin de liste. */
  next_cursor: string | null;
}

/**
 * Paramètres de GET /api/collection (query string validée par le handler,
 * filtres et tri exécutés côté SQL — jamais de filtrage client).
 */
export interface CollectionQueryParams {
  cursor?: string;
  limit?: number;
  theme?: string;
  rarity?: Rarity;
  search?: string;
  sort?: 'recent' | 'rarity' | 'print_number' | 'name';
}

/** Entrée d'album : un perso du pool, possédé ou en silhouette. */
export interface AlbumEntryDto {
  character: CharacterSummaryDto;
  owned: boolean;
  owned_count: number;
  /** Plus bas print possédé (prestige) ; null si non possédé. */
  best_print_number: number | null;
}

/** Groupe d'album par anime, avec barre de complétion. */
export interface AlbumGroupDto {
  anime_title: string;
  total: number;
  owned: number;
  entries: AlbumEntryDto[];
}

export interface AlbumDto {
  groups: AlbumGroupDto[];
  total_characters: number;
  owned_characters: number;
}

/** Détail d'une carte : la carte + l'agrégat public de possession. */
export interface CardDetailDto extends CardDto {
  /** Nb de joueurs distincts possédant ce perso (count agrégé indexé). */
  owners_count: number;
}

/** Profil public (page /u/[username]). */
export interface PublicProfileDto {
  id: string;
  username: string;
  created_at: string;
  login_streak: number;
  cards_obtained_count: number;
  /** Nb de persos distincts possédés. */
  unique_characters: number;
  /** % du pool total de characters possédé (0-100). */
  completion_percent: number;
  /** Plus bas print du joueur (prestige Karuta) ; null si aucune carte. */
  best_print: {
    character: CharacterSummaryDto;
    print_number: number;
  } | null;
  /** Rareté la plus haute possédée ; null si aucune carte. */
  best_rarity: Rarity | null;
  /** Vitrine : jusqu'à 5 cartes mises en avant par le joueur. */
  showcase: CardDto[];
  /** Wishlist publique du joueur. */
  wishlist: CharacterSummaryDto[];
}

/** Contenu d'un thème : nb de persos par rareté + envies du joueur présentes. */
export interface ThemePoolInfoDto {
  theme_slug: string;
  total_characters: number;
  by_rarity: Record<Rarity, number>;
  /** Nb de persos de la wishlist du joueur présents dans ce pool
   *  (affiché "X de tes envies dans ce booster"). */
  wishlist_matches: number;
}

// ---------------------------------------------------------------------------
// POST /api/boosters/open
// ---------------------------------------------------------------------------

export type OpenBoosterRequest = OpenBoosterInput;

export interface OpenBoosterResponse {
  cards: OpenedCardDto[];
  is_golden: boolean;
  /** Stock restant APRÈS l'ouverture (le client n'a pas à le décrémenter). */
  booster_count: number;
  pity_legendary_left: number;
  pity_mythic_left: number;
  golden_counter: number;
  /** Soldes mis à jour par la RPC (le client ne calcule rien). */
  premium_points: number;
  chakra: number;
  cards_obtained_count: number;
}

// ---------------------------------------------------------------------------
// POST /api/boosters/open-premium
// ---------------------------------------------------------------------------

export type OpenPremiumBoosterRequest = OpenPremiumBoosterInput;

export interface OpenPremiumBoosterResponse {
  /** 1 carte minimum, Légendaire minimum garantie (roll 85% L / 15% M). */
  card: OpenedCardDto;
  is_golden: boolean;
  booster_count: number;
  pity_legendary_left: number;
  pity_mythic_left: number;
  golden_counter: number;
  premium_points: number;
  chakra: number;
  cards_obtained_count: number;
}

// ---------------------------------------------------------------------------
// POST /api/boosters/daily — pack du jour (1/jour, Épique min, gratuit)
// ---------------------------------------------------------------------------

export type ClaimDailyPackRequest = ClaimDailyPackInput;

export interface ClaimDailyPackResponse {
  cards: OpenedCardDto[];
  theme: ThemeDto;
  /** Minuit Europe/Paris du prochain reset. */
  next_reset_at: string;
  booster_count: number;
  pity_legendary_left: number;
  pity_mythic_left: number;
  golden_counter: number;
  premium_points: number;
  chakra: number;
  cards_obtained_count: number;
}

// ---------------------------------------------------------------------------
// GET /api/boosters/state
// ---------------------------------------------------------------------------

export type GetBoosterStateResponse = BoosterStateDto;

// ---------------------------------------------------------------------------
// POST /api/cards/burn
// ---------------------------------------------------------------------------

export type BurnCardRequest = BurnInput;

export interface BurnCardResponse {
  /** Chakra crédité : base par rareté × multiplicateur de demande wishlist. */
  chakra_gained: number;
  /** Solde de chakra APRÈS le burn. */
  new_balance: number;
}

// ---------------------------------------------------------------------------
// GET /api/collection — pagination par curseur
// ---------------------------------------------------------------------------

export type GetCollectionResponse = CollectionPageDto;

// ---------------------------------------------------------------------------
// GET /api/collection/album — silhouettes groupées par anime
// ---------------------------------------------------------------------------

export type GetAlbumResponse = AlbumDto;

// ---------------------------------------------------------------------------
// GET /api/cards/:id — détail carte + nb de joueurs possédant le perso
// ---------------------------------------------------------------------------

export type GetCardResponse = CardDetailDto;

// ---------------------------------------------------------------------------
// GET /api/quests — les 3 quêtes du jour + reset
// ---------------------------------------------------------------------------

export interface GetQuestsResponse {
  quests: QuestDto[];
  /** Prochain minuit Europe/Paris (nouvelles quêtes + pack du jour). */
  next_reset_at: string;
}

// ---------------------------------------------------------------------------
// POST /api/quests/claim — réclamation des quêtes complétées (chakra)
// Route requise par la RPC claim_quests du schéma ; absente de la liste
// initiale de l'Agent A → ajoutée ici pour complétude du contrat.
// ---------------------------------------------------------------------------

export type ClaimQuestsRequest = ClaimQuestsInput;

export interface ClaimQuestsResponse {
  /** Chakra total crédité par ce claim. */
  chakra_gained: number;
  /** Solde de chakra APRÈS le claim. */
  new_balance: number;
  /** Quêtes effectivement réclamées (les complétées non encore claim). */
  claimed_quest_ids: string[];
}

// ---------------------------------------------------------------------------
// POST /api/shop/buy — achat d'un cosmétique en chakra
// ---------------------------------------------------------------------------

export type BuyCosmeticRequest = BuyCosmeticInput;

export interface BuyCosmeticResponse {
  cosmetic: CosmeticDto;
  /** Solde de chakra APRÈS l'achat. */
  new_balance: number;
}

// ---------------------------------------------------------------------------
// POST /api/cards/:id/apply-cosmetic
// ---------------------------------------------------------------------------

export type ApplyCosmeticRequest = ApplyCosmeticInput;

export interface ApplyCosmeticResponse {
  /** La carte avec son slot cosmétique mis à jour. */
  card: CardDto;
}

// ---------------------------------------------------------------------------
// POST /api/cards/:id/reroll-cosmetic
// ---------------------------------------------------------------------------

export type RerollCosmeticRequest = RerollCosmeticInput;

export interface RerollCosmeticResponse {
  /** La carte avec le nouveau cosmétique du slot. */
  card: CardDto;
  new_cosmetic: CosmeticDto;
  /** Solde de chakra APRÈS le coût du reroll. */
  new_balance: number;
}

// ---------------------------------------------------------------------------
// POST /api/wishlist/toggle — naturellement idempotent, pas de clé
// ---------------------------------------------------------------------------

export type ToggleWishlistRequest = WishlistToggleInput;

export interface ToggleWishlistResponse {
  /** true = le perso a été AJOUTÉ, false = retiré. */
  added: boolean;
  /** Nouveau compteur wishlist du perso (alimente la valeur de burn). */
  wishlist_count: number;
  slots_used: number;
  slots_max: number;
}

// ---------------------------------------------------------------------------
// GET /api/wishlist
// ---------------------------------------------------------------------------

export interface GetWishlistResponse {
  items: CharacterSummaryDto[];
  slots_used: number;
  slots_max: number;
}

// ---------------------------------------------------------------------------
// GET /api/themes/:slug/pool-info
// ---------------------------------------------------------------------------

export type GetThemePoolInfoResponse = ThemePoolInfoDto;
