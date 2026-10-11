/**
 * ============================================================================
 * MANGA SOCIETY — pipeline de données (Agent C)
 * Types partagés du pipeline. Aucun type DB inline : les lignes écrites en base
 * respectent `types/database.ts` (généré depuis le schéma).
 * ============================================================================
 */

/** Les 6 slugs de `themes` (cf. supabase/migrations/0000_seed.sql). */
export type ThemeSlug = 'shonen' | 'shojo' | 'seinen' | 'isekai' | 'webtoon' | 'big3';

/** Les 6 tiers de rareté (check constraint `characters.base_rarity`). */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

/** Un media AniList attaché à un personnage (déjà filtré côté client). */
export interface MediaInfo {
  titleRomaji: string | null;
  genres: string[];
  format: string | null; // ANIME | MANGA | MANHWA | NOVEL | …
  countryOfOrigin: string | null; // JP | KR | …
  isAdult: boolean;
  synopsis: string | null; // sert au mot-clé isekai (logique simple, rapportée)
}

/** Personnage brut tel que renvoyé par AniList (avant filtrage/classification). */
export interface RawCharacter {
  anilistId: number;
  nameRomaji: string; // name.full
  nameNative: string | null;
  imageUrl: string | null; // image.large
  favourites: number;
  media: MediaInfo[];
  demographics: string[]; // démographies Jikan explicites (Shounen/Shoujo/Seinen/Josei), si résolues
}

/** Personnage accepté : image résolue (AniList ou fallback Jikan), thèmes classés. */
export interface CharacterCandidate extends RawCharacter {
  imageUrlResolved: string; // AniList, ou fallback Jikan si AniList indisponible
  imageFallback: string | null; // image_url_fallback (Jikan) si différente de la principale
  animeTitle: string | null; // titre romaji du media principal (le plus pertinent)
  themes: ThemeSlug[];
  rarity: Rarity; // calculée par percentiles de `favourites` sur le pool (assignRarities)
}

/** Ligne d'upsert idempotent dans `characters` (clé : anilist_id). */
export interface CharacterRow {
  anilist_id: number;
  name_romaji: string;
  name_native: string | null;
  image_url: string;
  image_url_fallback: string | null;
  anime_title: string | null;
  favourites: number;
  base_rarity: Rarity;
  rarity_overridden: false;
  themes: ThemeSlug[];
}
