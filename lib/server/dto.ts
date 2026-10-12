/**
 * lib/server/dto.ts — mapping des résultats RPC (jsonb) vers les contrats
 * de types/api.ts.
 *
 * Les mutations d'ouverture (open/premium/daily) renvoient des cartes
 * partielles (la RPC connaît id perso, rareté, print…). Le DTO contractuel
 * exige le résumé complet du perso (image, compteurs) et le flag
 * `is_new_character` — calculé ICI côté serveur (jamais le client) :
 *   - un perso est « nouveau » si le joueur ne possédait aucune carte de ce
 *     perso STRICTEMENT avant l'ouverture (borne basse horodatée capturée
 *     avant l'appel RPC, avec garde de dérive d'horloge) ;
 *   - 3 requêtes indexées quel que soit le nombre de cartes (pas de N+1).
 *
 * Tout écart de forme RPC vs schéma zod = bug serveur → 500 INTERNAL_ERROR
 * (RpcParseError porte le détail pour le log serveur uniquement).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { GAME_CONFIG, RARITIES, type Rarity } from '@/lib/config';
import type { Database, Tables } from '@/types/database';
import type {
  CardDetailDto,
  CardSource,
  CharacterSummaryDto,
  ClaimDailyPackResponse,
  CosmeticDto,
  LoginStreakResponse,
  OpenBoosterResponse,
  OpenPremiumBoosterResponse,
  OpenedCardDto,
  ThemeDto,
} from '@/types/api';

type Supabase = SupabaseClient<Database>;

/**
 * Caste un résultat de RPC de lecture vers son contrat types/api.ts.
 * La forme jsonb est produite par les RPC de la migration 0003 (voir
 * MIGRATIONS.md) — ce sont elles qui garantissent la structure, le handler
 * reste une couche de transport.
 */
export function asDto<T>(data: unknown): T {
  return data as T;
}

// ---------------------------------------------------------------------------
// Erreur de contrat RPC (forme inattendue) — détail pour le log serveur.
// ---------------------------------------------------------------------------

class RpcParseError extends Error {
  constructor(detail: string) {
    super(`[rpc] Résultat RPC hors contrat : ${detail}`);
    this.name = 'RpcParseError';
  }
}

function parseRpc<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new RpcParseError(parsed.error.issues.map((i) => i.path.join('.')).join(', '));
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Schémas zod des résultats RPC de mutation (0001_functions.sql)
// ---------------------------------------------------------------------------

const rpcGrantedCardSchema = z.object({
  card_id: z.string().uuid(),
  character_id: z.string().uuid(),
  name_romaji: z.string(),
  anime_title: z.string().nullable(),
  rarity: z.enum(RARITIES),
  print_number: z.number().int().positive(),
  first_owner: z.boolean(),
});
export type RpcGrantedCard = z.infer<typeof rpcGrantedCardSchema>;

const openingStateFields = {
  is_golden: z.boolean(),
  pity_legendary: z.number().int(),
  pity_mythic: z.number().int(),
  golden_counter: z.number().int(),
} as const;

const openBoosterResultSchema = z.object({
  cards: z.array(rpcGrantedCardSchema),
  ...openingStateFields,
  theme_slug: z.string(),
  booster_count: z.number().int(),
  premium_points: z.number().int(),
  chakra: z.number().int(),
  cards_obtained_count: z.number().int(),
});

const openPremiumResultSchema = z.object({
  // Depuis la migration 0004 : exactement 1 carte (Légendaire minimum).
  cards: z.array(rpcGrantedCardSchema).length(1),
  ...openingStateFields,
  theme_slug: z.string(),
  premium_points: z.number().int(),
  chakra: z.number().int(),
});

const dailyPackResultSchema = z.object({
  cards: z.array(rpcGrantedCardSchema),
  ...openingStateFields,
  theme_slug: z.string(),
  day: z.string(),
});

const loginStreakResultSchema = z.object({
  login_streak: z.number().int(),
  reward: z.enum(['none', 'chakra', 'cosmetic']),
  chakra_gained: z.number().int(),
  new_balance: z.number().int().nullable(),
});

export const burnResultSchema = z.object({
  card_id: z.string().uuid(),
  rarity: z.enum(RARITIES),
  chakra_gained: z.number().int(),
  new_balance: z.number().int(),
});

export const claimQuestsResultSchema = z.object({
  claimed: z.array(z.string().uuid()),
  chakra_gained: z.number().int(),
  new_balance: z.number().int(),
});

export const buyCosmeticResultSchema = z.object({
  cosmetic_id: z.string().uuid(),
  slug: z.string(),
  chakra_price: z.number().int(),
  new_balance: z.number().int(),
});

export const applyCosmeticResultSchema = z.object({
  card_id: z.string().uuid(),
  cosmetic_id: z.string().uuid(),
  slug: z.string(),
  type: z.string(),
  applied: z.boolean(),
});

export const rerollCosmeticResultSchema = z.object({
  card_id: z.string().uuid(),
  cosmetic_type: z.enum(['frame', 'holo', 'dye']),
  burned_cosmetic: z.string().uuid(),
  new_cosmetic: z.string().uuid(),
  new_cosmetic_slug: z.string(),
  chakra_cost: z.number().int(),
  new_balance: z.number().int(),
});

export const toggleWishlistResultSchema = z.object({
  in_wishlist: z.boolean(),
  wishlist_count: z.number().int(),
});

// ---------------------------------------------------------------------------
// Helpers de mapping unitaires
// ---------------------------------------------------------------------------

/** Garde de dérive d'horloge client/serveur pour le filtre « possédé avant ». */
const SKEW_GUARD_MS = 3000;

export function toCharacterSummary(ch: Tables<'characters'>): CharacterSummaryDto {
  return {
    id: ch.id,
    anilist_id: ch.anilist_id,
    name_romaji: ch.name_romaji,
    name_native: ch.name_native,
    image_url: ch.image_url,
    image_url_fallback: ch.image_url_fallback,
    anime_title: ch.anime_title,
    // Garanti par la CHECK constraint base_rarity (schéma 0000).
    base_rarity: ch.base_rarity as Rarity,
    print_count: ch.print_count,
    wishlist_count: ch.wishlist_count,
  };
}

export function toCosmeticDto(row: Tables<'cosmetics'>): CosmeticDto {
  return {
    id: row.id,
    // Garanti par la CHECK constraint type (schéma 0000).
    type: row.type as CosmeticDto['type'],
    name_fr: row.name_fr,
    name_en: row.name_en,
    chakra_price: row.chakra_price,
    is_ultra_rare: row.is_ultra_rare,
    // Garanti objet (jsonb not null) par le schéma ; rendu 100 % piloté CSS.
    css_config: row.css_config as Record<string, unknown>,
  };
}

export function toThemeDto(row: Tables<'themes'>): ThemeDto {
  return {
    slug: row.slug,
    name_fr: row.name_fr,
    name_en: row.name_en,
    icon: row.icon,
    pack_art_url: row.pack_art_url,
    sort_order: row.sort_order,
  };
}

// ---------------------------------------------------------------------------
// Hydratation des cartes d'ouverture → OpenedCardDto
// ---------------------------------------------------------------------------

export async function hydrateOpenedCards(
  supabase: Supabase,
  userId: string,
  cards: RpcGrantedCard[],
  obtainedBefore: Date,
  source: CardSource,
): Promise<OpenedCardDto[]> {
  const charIds = [...new Set(cards.map((c) => c.character_id))];
  const cardIds = cards.map((c) => c.card_id);
  const beforeIso = new Date(obtainedBefore.getTime() - SKEW_GUARD_MS).toISOString();

  const [charsRes, preOwnedRes, newCardsRes] = await Promise.all([
    supabase.from('characters').select('*').in('id', charIds),
    supabase
      .from('user_cards')
      .select('character_id')
      .eq('user_id', userId)
      .in('character_id', charIds)
      .lt('obtained_at', beforeIso),
    supabase.from('user_cards').select('id, obtained_at').in('id', cardIds),
  ]);

  if (charsRes.error) throw charsRes.error;
  if (preOwnedRes.error) throw preOwnedRes.error;
  if (newCardsRes.error) throw newCardsRes.error;

  const charById = new Map((charsRes.data ?? []).map((c) => [c.id, c]));
  const preOwned = new Set((preOwnedRes.data ?? []).map((r) => r.character_id));
  const obtainedAtById = new Map(
    (newCardsRes.data ?? []).map((r) => [r.id, r.obtained_at]),
  );

  return cards.map((card) => {
    const ch = charById.get(card.character_id);
    if (!ch) {
      // Perso introuvable après un tirage = incohérence serveur grave.
      throw new RpcParseError(`character ${card.character_id} introuvable`);
    }
    return {
      id: card.card_id,
      character: toCharacterSummary(ch),
      print_number: card.print_number,
      first_owner: card.first_owner,
      // Cartes neuves : aucun cosmétique appliqué à l'obtention.
      frame: null,
      holo: null,
      dye: null,
      source,
      obtained_at: obtainedAtById.get(card.card_id) ?? obtainedBefore.toISOString(),
      is_new_character: !preOwned.has(card.character_id),
    };
  });
}

function pityLeft(elapsed: number, threshold: number): number {
  return Math.max(0, threshold - elapsed);
}

// ---------------------------------------------------------------------------
// Réponses d'ouverture (open / premium / daily)
// ---------------------------------------------------------------------------

export async function toOpenBoosterResponse(
  supabase: Supabase,
  userId: string,
  data: unknown,
  obtainedBefore: Date,
): Promise<OpenBoosterResponse> {
  const r = parseRpc(openBoosterResultSchema, data);
  const cards = await hydrateOpenedCards(supabase, userId, r.cards, obtainedBefore, 'booster');
  return {
    cards,
    is_golden: r.is_golden,
    booster_count: r.booster_count,
    pity_legendary_left: pityLeft(r.pity_legendary, GAME_CONFIG.pity.legendary),
    pity_mythic_left: pityLeft(r.pity_mythic, GAME_CONFIG.pity.mythic),
    golden_counter: r.golden_counter,
    premium_points: r.premium_points,
    chakra: r.chakra,
    cards_obtained_count: r.cards_obtained_count,
  };
}

export async function toOpenPremiumBoosterResponse(
  supabase: Supabase,
  userId: string,
  data: unknown,
  obtainedBefore: Date,
): Promise<OpenPremiumBoosterResponse> {
  const r = parseRpc(openPremiumResultSchema, data);
  const [card, ...extra] = await hydrateOpenedCards(
    supabase,
    userId,
    r.cards,
    obtainedBefore,
    'premium',
  );
  if (!card || extra.length > 0) {
    throw new RpcParseError('premium : carte unique attendue');
  }
  return {
    card,
    is_golden: r.is_golden,
    theme_slug: r.theme_slug,
    premium_points: r.premium_points,
    chakra: r.chakra,
    pity_legendary_left: pityLeft(r.pity_legendary, GAME_CONFIG.pity.legendary),
    pity_mythic_left: pityLeft(r.pity_mythic, GAME_CONFIG.pity.mythic),
    golden_counter: r.golden_counter,
  };
}

export async function toClaimDailyPackResponse(
  supabase: Supabase,
  userId: string,
  data: unknown,
  obtainedBefore: Date,
): Promise<ClaimDailyPackResponse> {
  const r = parseRpc(dailyPackResultSchema, data);
  const [cards, theme, resetRes] = await Promise.all([
    hydrateOpenedCards(supabase, userId, r.cards, obtainedBefore, 'daily'),
    fetchTheme(supabase, r.theme_slug),
    supabase.rpc('get_next_reset_at'),
  ]);
  if (resetRes.error) throw resetRes.error;
  const nextReset = parseRpc(z.string(), resetRes.data);
  return {
    cards,
    is_golden: r.is_golden,
    theme,
    next_reset_at: nextReset,
    pity_legendary_left: pityLeft(r.pity_legendary, GAME_CONFIG.pity.legendary),
    pity_mythic_left: pityLeft(r.pity_mythic, GAME_CONFIG.pity.mythic),
    golden_counter: r.golden_counter,
  };
}

async function fetchTheme(supabase: Supabase, slug: string): Promise<ThemeDto> {
  const { data, error } = await supabase.from('themes').select('*').eq('slug', slug).single();
  if (error) throw error;
  return toThemeDto(data);
}

// ---------------------------------------------------------------------------
// Réponses simples (streak, burn, quêtes, cosmétiques, wishlist)
// ---------------------------------------------------------------------------

export function toLoginStreakResponse(data: unknown): LoginStreakResponse {
  const r = parseRpc(loginStreakResultSchema, data);
  return {
    login_streak: r.login_streak,
    reward: r.reward,
    chakra_gained: r.chakra_gained,
    new_balance: r.new_balance,
  };
}

/** Détail carte complet (CardDetailDto) via la RPC de lecture 0003. */
export async function fetchCardDetail(
  supabase: Supabase,
  userId: string,
  cardId: string,
): Promise<CardDetailDto> {
  const { data, error } = await supabase.rpc('get_card_detail', {
    p_user: userId,
    p_card_id: cardId,
  });
  if (error) throw error;
  return asDto<CardDetailDto>(data);
}

/** Cosmétique par id (lecture publique). */
export async function fetchCosmetic(supabase: Supabase, cosmeticId: string): Promise<CosmeticDto> {
  const { data, error } = await supabase
    .from('cosmetics')
    .select('*')
    .eq('id', cosmeticId)
    .single();
  if (error) throw error;
  return toCosmeticDto(data);
}

/** Compteur wishlist public d'un personnage (alimente la réponse toggle). */
export async function fetchCharacterWishlistCount(
  supabase: Supabase,
  characterId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('characters')
    .select('wishlist_count')
    .eq('id', characterId)
    .single();
  if (error) throw error;
  return data.wishlist_count;
}
