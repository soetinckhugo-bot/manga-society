/**
 * ============================================================================
 * MANGA SOCIETY — pipeline de données (Agent C)
 * Classification des thèmes ET rareté de base. FONCTIONS PURES (aucun I/O,
 * aucune valeur d'équilibrage cachée) — unit-testées dans classify.test.ts.
 *
 * Règles (PROMPT C) :
 * - shonen : démo Shounen (Jikan) OU genres Action/Adventure
 * - shojo  : démo Shoujo (Josei compte pour shojo)
 * - seinen : démo Seinen
 * - isekai : genre "Isekai" OU mot-clé titre/synopsis (logique simple, rapportée)
 * - webtoon: media format MANGA/MANHWA/NOVEL ET countryOfOrigin "KR"
 * - big3   : liste curatée (One Piece, Naruto/Boruto, Bleach) — matching titre
 * Un personnage peut avoir PLUSIEURS thèmes. Les media isAdult sont exclus ;
 * un perso dont tous les media sont adultes est exclu du pool.
 * ============================================================================
 */

import type { MediaInfo, Rarity, ThemeSlug } from './types';

/** Liste curatée Big 3 — matching sur title.romaji, rapporté pour vérif humaine. */
export const BIG3_PATTERN = /\b(one piece|naruto|boruto|bleach)\b/i;

/**
 * Listes curatées SHOJO / SEINEN (décision V1 post-dry-run) : les démographies
 * explicites ne sont pas résolues pour tout le pool, donc on couvre les titres
 * célèbres par matching titre.romaji — "ce qui passe passe, on affinera plus
 * tard". Chaque liste reste courte et vérifiable ; les persos non matchés
 * restent untagged (listés dans le rapport, non importés en V1).
 */
export const SHOJO_TITLE_PATTERNS: RegExp[] = [
  /cardcaptor sakura/i,
  /sailor moon|bishoujo senshi/i,
  /fruits basket/i,
  /ouran/i,
  /kimi ni todoke/i,
  /maid-sama|maid sama/i,
  /\bnana\b/i,
  /skip beat/i,
  /vampire knight/i,
  /fushigi yuugi/i,
  /magic knight rayearth/i,
  /utena/i,
  /akatsuki no yona/i,
  /kamisama/i,
  /ao haru ride/i,
  /lovely[\s-]?complex/i,
  /hana yori dango/i,
  /marmalade boy/i,
  /kodomo no omocha/i,
  /gakuen alice/i,
  /ore monogatari/i,
  /dengeki daisy/i,
  /special a\b/i,
  /bokura ga ita/i,
  /itazura na kiss/i,
  /peach girl/i,
  /full moon wo sagashite/i,
  /ultra maniac/i,
  /princess tutu/i,
  /violet evergarden/i, // LN originel, marketing shojo — V1 (à affiner)
];

export const SEINEN_TITLE_PATTERNS: RegExp[] = [
  /berserk/i,
  /vagabond/i,
  /\bmonster\b/i,
  /20th century boys/i,
  /ghost in the shell/i,
  /hellsing/i,
  /tokyo ghoul/i,
  /parasyte|kiseijuu/i,
  /\bakira\b/i,
  /gunnm|battle angel/i,
  /\bblame\b/i,
  /vinland saga/i,
  /oyasumi punpun/i,
  /\bkaiji\b/i,
  /\bakagi\b/i,
  /one outs/i,
  /rainbow/i,
  /\bgantz\b/i,
  /elfen lied/i,
  /basilisk/i,
  /dorohedoro/i,
  /houseki no kuni/i,
  /made in abyss/i,
  /shoujo shuumatsu ryokou|girls'? last tour/i,
  /kaguya-sama/i, // Young Jump = seinen (réintègre Chika Fujiwara)
  /steins;gate/i, // adaptation Monthly Comic Alive (réintègre Kurisu Makise)
  /black lagoon/i,
  /jormungand/i,
  /gangsta/i,
  /deadman wonderland/i,
  /ergo proxy/i,
  /texhnolyze/i,
  /mushishi/i,
  /3-gatsu no lion|march comes in like a lion/i,
];

/**
 * Shonen curaté complémentaire : titres Weekly/Monthly Shounen Jump célèbres
 * DONT les genres AniList ne contiennent ni Action ni Adventure (Death Note =
 * Mystery/Thriller, Haikyuu = Sports…) — la règle genre seule les excluait.
 */
export const SHONEN_TITLE_PATTERNS: RegExp[] = [
  /death note/i, // WSJ (réintègre L Lawliet)
  /haikyuu/i,
  /kuroko no basket/i,
  /hajime no ippo/i,
  /yakusoku no neverland|promised neverland/i,
  /shokugeki no souma|food wars/i,
  /yuri!!! on ice|yuri on ice/i,
  /tennis no ouji|prince of tennis/i,
  /diamond no ace|ace of diamond/i,
  /kaze ga tsuyoku fuiteiru|run with the wind/i,
  /slam dunk/i,
  /shigatsu wa kimi no uso|your lie in april/i, // Monthly Shounen Magazine
];

/** Mot-clé isekai "simple et rapporté" : titre explicite. */
export const ISEKAI_TITLE_PATTERN = /\bisekai\b/i;

/**
 * Mot-clé isekai côté synopsis, volontairement STRICT : exige l'idée de
 * TRANSPORT vers un autre monde (réincarnation / invocation / transfert).
 * Une simple mention de "another world" produit des faux positifs constatés
 * en dry-run (Light Yagami, Marin Kitagawa) — d'où la double condition.
 */
export const ISEKAI_SYNOPSIS_PATTERN =
  /(reincarnat\w*|summoned|transported)[^.]{0,80}another world|another world[^.]{0,80}(reincarnat\w*|summoned|transported)/i;

export interface ClassifyInput {
  media: MediaInfo[];
  demographics: string[]; // ex. ['Shounen', 'Shoujo', 'Seinen', 'Josei'] (Jikan)
}

export interface ClassifyResult {
  themes: ThemeSlug[];
  excludedReason: string | null; // null = accepté ; sinon 'adult_media' | 'no_theme'
}

export function classifyCharacter(input: ClassifyInput): ClassifyResult {
  const media = input.media.filter((m) => !m.isAdult);
  if (media.length === 0) {
    return { themes: [], excludedReason: 'adult_media' };
  }

  const themes = new Set<ThemeSlug>();
  const demo = new Set(input.demographics.map((d) => d.toLowerCase()));

  if (demo.has('shounen') || media.some((m) => m.genres.includes('Action') || m.genres.includes('Adventure'))) {
    themes.add('shonen');
  }
  if (demo.has('shoujo') || demo.has('josei')) {
    themes.add('shojo');
  }
  if (demo.has('seinen')) {
    themes.add('seinen');
  }
  // Listes curatées V1 : matching sur les titres romaji des media (cf. commentaires).
  if (media.some((m) => m.titleRomaji !== null && SHOJO_TITLE_PATTERNS.some((p) => p.test(m.titleRomaji as string)))) {
    themes.add('shojo');
  }
  if (media.some((m) => m.titleRomaji !== null && SEINEN_TITLE_PATTERNS.some((p) => p.test(m.titleRomaji as string)))) {
    themes.add('seinen');
  }
  if (media.some((m) => m.titleRomaji !== null && SHONEN_TITLE_PATTERNS.some((p) => p.test(m.titleRomaji as string)))) {
    themes.add('shonen');
  }
  if (
    media.some(
      (m) =>
        m.genres.includes('Isekai') ||
        (m.titleRomaji !== null && ISEKAI_TITLE_PATTERN.test(m.titleRomaji)) ||
        (m.synopsis !== null && ISEKAI_SYNOPSIS_PATTERN.test(m.synopsis)),
    )
  ) {
    themes.add('isekai');
  }
  if (media.some((m) => ['MANGA', 'MANHWA', 'NOVEL'].includes(m.format ?? '') && m.countryOfOrigin === 'KR')) {
    themes.add('webtoon');
  }
  if (media.some((m) => m.titleRomaji !== null && BIG3_PATTERN.test(m.titleRomaji))) {
    themes.add('big3');
  }

  if (themes.size === 0) {
    return { themes: [], excludedReason: 'no_theme' };
  }
  return { themes: [...themes].sort() as ThemeSlug[], excludedReason: null };
}

/* ----------------------------------------------------------------------------
 * Rareté de base : 6 tiers par percentiles de `favourites` AniList sur le pool.
 * top 1 % = mythic · 1→5 % = legendary · 5→20 % = epic · 20→45 % = rare ·
 * 45→75 % = uncommon · reste = common.
 * ------------------------------------------------------------------------- */

export const RARITY_THRESHOLDS = {
  mythic: 1,
  legendary: 5,
  epic: 20,
  rare: 45,
  uncommon: 75,
} as const;

export function rarityForPercentile(percentile: number): Rarity {
  if (percentile <= RARITY_THRESHOLDS.mythic) return 'mythic';
  if (percentile <= RARITY_THRESHOLDS.legendary) return 'legendary';
  if (percentile <= RARITY_THRESHOLDS.epic) return 'epic';
  if (percentile <= RARITY_THRESHOLDS.rare) return 'rare';
  if (percentile <= RARITY_THRESHOLDS.uncommon) return 'uncommon';
  return 'common';
}

/**
 * Attribue une rareté à chaque élément du pool : tri par `favourites` décroissant,
 * percentile = (rang / taille du pool). Les ex æquo partagent la rareté du rang
 * le plus favorable (ils sont adjacents après le tri stable).
 */
export function assignRarities<T extends { favourites: number }>(items: readonly T[]): Map<T, Rarity> {
  const sorted = [...items].sort((a, b) => b.favourites - a.favourites);
  const n = sorted.length;
  const out = new Map<T, Rarity>();
  sorted.forEach((item, i) => {
    const percentile = n === 0 ? 100 : ((i + 1) / n) * 100;
    out.set(item, rarityForPercentile(percentile));
  });
  return out;
}
