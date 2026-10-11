/**
 * Tests unitaires de la classification (pipeline/classify.ts) — table de cas.
 * La classification est PURE : aucun I/O, aucune valeur cachée.
 */
import { describe, expect, it } from 'vitest';

import { assignRarities, classifyCharacter, rarityForPercentile } from './classify';
import type { MediaInfo } from './types';

function media(partial: Partial<MediaInfo>): MediaInfo {
  return {
    titleRomaji: null,
    genres: [],
    format: 'ANIME',
    countryOfOrigin: 'JP',
    isAdult: false,
    synopsis: null,
    ...partial,
  };
}

describe('classifyCharacter — règles par thème', () => {
  it('shonen via genre Action', () => {
    const r = classifyCharacter({ media: [media({ genres: ['Action'] })], demographics: [] });
    expect(r.themes).toEqual(['shonen']);
    expect(r.excludedReason).toBeNull();
  });

  it('shonen via genre Adventure', () => {
    const r = classifyCharacter({ media: [media({ genres: ['Adventure'] })], demographics: [] });
    expect(r.themes).toEqual(['shonen']);
  });

  it('shonen via démographie Jikan explicite', () => {
    const r = classifyCharacter({ media: [media({})], demographics: ['Shounen'] });
    expect(r.themes).toEqual(['shonen']);
  });

  it('shojo via démographie Shoujo, et Josei compte pour shojo', () => {
    expect(classifyCharacter({ media: [media({})], demographics: ['Shoujo'] }).themes).toEqual(['shojo']);
    expect(classifyCharacter({ media: [media({})], demographics: ['Josei'] }).themes).toEqual(['shojo']);
  });

  it('seinen via démographie Seinen', () => {
    const r = classifyCharacter({ media: [media({})], demographics: ['Seinen'] });
    expect(r.themes).toEqual(['seinen']);
  });

  it('isekai via genre', () => {
    const r = classifyCharacter({ media: [media({ genres: ['Isekai'] })], demographics: [] });
    expect(r.themes).toEqual(['isekai']);
  });

  it('isekai via mot-clé titre (le mot "Isekai" dans le titre)', () => {
    const r = classifyCharacter({
      media: [media({ titleRomaji: 'Isekai Quartet' })],
      demographics: [],
    });
    expect(r.themes).toEqual(['isekai']);
  });

  it('isekai via synopsis (reincarnated)', () => {
    const r = classifyCharacter({
      media: [media({ synopsis: 'A man who died and was reincarnated in another world.' })],
      demographics: [],
    });
    expect(r.themes).toEqual(['isekai']);
  });

  it('webtoon via format MANHWA + KR', () => {
    const r = classifyCharacter({
      media: [media({ format: 'MANHWA', countryOfOrigin: 'KR' })],
      demographics: [],
    });
    expect(r.themes).toEqual(['webtoon']);
  });

  it('webtoon exige le KR (MANHWA JP = pas webtoon)', () => {
    const r = classifyCharacter({
      media: [media({ format: 'MANHWA', countryOfOrigin: 'JP' })],
      demographics: [],
    });
    expect(r.themes).toEqual([]);
    expect(r.excludedReason).toBe('no_theme');
  });

  it('big3 via liste curatée (One Piece, Naruto, Boruto, Bleach)', () => {
    for (const title of ['One Piece', 'Naruto Shippuden', 'Boruto', 'BLEACH']) {
      const r = classifyCharacter({ media: [media({ titleRomaji: title, genres: ['Action'] })], demographics: [] });
      expect(r.themes).toContain('big3');
      expect(r.themes).toContain('shonen'); // multi-thèmes : un perso Big 3 est aussi shonen
    }
  });

  it('multi-thèmes cumulés (webtoon KR + Action → shonen + webtoon)', () => {
    const r = classifyCharacter({
      media: [media({ format: 'MANHWA', countryOfOrigin: 'KR', genres: ['Action'] })],
      demographics: [],
    });
    expect(r.themes).toEqual(['shonen', 'webtoon']);
  });

  it('exclut les media adultes ; perso 100 % adulte → excluded', () => {
    const r = classifyCharacter({ media: [media({ isAdult: true, genres: ['Action'] })], demographics: [] });
    expect(r.excludedReason).toBe('adult_media');
  });

  it('ignore les nodes adultes mais garde les nodes sains', () => {
    const r = classifyCharacter({
      media: [media({ isAdult: true }), media({ genres: ['Adventure'] })],
      demographics: [],
    });
    expect(r.excludedReason).toBeNull();
    expect(r.themes).toEqual(['shonen']);
  });

  it('listes curatées V1 : les 4 persos exclus du dry-run sont réintégrés', () => {
    // Chika Fujiwara ← Kaguya-sama (Young Jump = seinen)
    expect(
      classifyCharacter({ media: [media({ titleRomaji: 'Kaguya-sama wa Kokurasetai' })], demographics: [] }).themes,
    ).toContain('seinen');
    // Kurisu Makise ← Steins;Gate
    expect(
      classifyCharacter({ media: [media({ titleRomaji: 'Steins;Gate' })], demographics: [] }).themes,
    ).toContain('seinen');
    // L Lawliet ← Death Note (WSJ, genres Mystery/Thriller → la règle genre seule excluait)
    expect(
      classifyCharacter({
        media: [media({ titleRomaji: 'Death Note', genres: ['Mystery', 'Psychological', 'Thriller'] })],
        demographics: [],
      }).themes,
    ).toContain('shonen');
    // Violet Evergarden ← liste shojo (V1)
    expect(
      classifyCharacter({ media: [media({ titleRomaji: 'Violet Evergarden' })], demographics: [] }).themes,
    ).toContain('shojo');
  });

  it('curated shojo : Cardcaptor Sakura et Fruits Basket', () => {
    expect(
      classifyCharacter({ media: [media({ titleRomaji: 'Cardcaptor Sakura' })], demographics: [] }).themes,
    ).toEqual(['shojo']);
    expect(
      classifyCharacter({ media: [media({ titleRomaji: 'Fruits Basket' })], demographics: [] }).themes,
    ).toEqual(['shojo']);
  });

  it('curated seinen : Berserk et Made in Abyss', () => {
    expect(classifyCharacter({ media: [media({ titleRomaji: 'Berserk' })], demographics: [] }).themes).toEqual([
      'seinen',
    ]);
    expect(
      classifyCharacter({ media: [media({ titleRomaji: 'Made in Abyss' })], demographics: [] }).themes,
    ).toEqual(['seinen']);
  });

  it('curated shonen : Haikyuu (Sports, sans Action/Adventure)', () => {
    expect(
      classifyCharacter({ media: [media({ titleRomaji: 'Haikyuu!!', genres: ['Sports', 'Comedy', 'Drama'] })], demographics: [] }).themes,
    ).toEqual(['shonen']);
  });

  it('aucun thème applicable → excluded no_theme', () => {
    const r = classifyCharacter({ media: [media({ genres: ['Drama'] })], demographics: [] });
    expect(r.excludedReason).toBe('no_theme');
  });

  it('aucun media → excluded adult_media (garde-fou, non qualifiable)', () => {
    const r = classifyCharacter({ media: [], demographics: [] });
    expect(r.excludedReason).toBe('adult_media');
  });
});

describe('rarityForPercentile — 6 tiers', () => {
  it('frontières exactes', () => {
    expect(rarityForPercentile(0.5)).toBe('mythic');
    expect(rarityForPercentile(1)).toBe('mythic');
    expect(rarityForPercentile(1.01)).toBe('legendary');
    expect(rarityForPercentile(5)).toBe('legendary');
    expect(rarityForPercentile(5.01)).toBe('epic');
    expect(rarityForPercentile(20)).toBe('epic');
    expect(rarityForPercentile(20.01)).toBe('rare');
    expect(rarityForPercentile(45)).toBe('rare');
    expect(rarityForPercentile(45.01)).toBe('uncommon');
    expect(rarityForPercentile(75)).toBe('uncommon');
    expect(rarityForPercentile(75.01)).toBe('common');
    expect(rarityForPercentile(100)).toBe('common');
  });
});

describe('assignRarities — percentiles sur le pool', () => {
  it('le plus populaire est mythic, le queue est common', () => {
    const pool = Array.from({ length: 100 }, (_, i) => ({ favourites: 100 - i }));
    const rarities = assignRarities(pool);
    const sorted = [...pool].sort((a, b) => b.favourites - a.favourites);
    expect(rarities.get(sorted[0])).toBe('mythic'); // rang 1/100 = 1 %
    expect(rarities.get(sorted[99])).toBe('common'); // 100 %
  });

  it('pool vide = pas de crash', () => {
    expect(assignRarities([]).size).toBe(0);
  });

  it('respecte les bornes (1 % mythic sur 200 persos → 2 mythics)', () => {
    const pool = Array.from({ length: 200 }, (_, i) => ({ favourites: 1000 - i }));
    const rarities = assignRarities(pool);
    const counts = new Map<string, number>();
    for (const r of rarities.values()) counts.set(r, (counts.get(r) ?? 0) + 1);
    expect(counts.get('mythic')).toBe(2); // rangs 1 et 2 → 0,5 % et 1 %
    expect(counts.get('legendary')).toBe(8); // 1→5 % : rangs 3..10
  });
});
