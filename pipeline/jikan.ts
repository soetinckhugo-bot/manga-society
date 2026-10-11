/**
 * ============================================================================
 * MANGA SOCIETY — pipeline de données (Agent C)
 * Client Jikan v4 — SANS clé. Deux rôles :
 * 1. Fallback image : un perso sans image AniList récupère l'image du personnage
 *    MAL le plus populaire correspondant au nom (images.jpg.image_url).
 * 2. (Optionnel, non branché par défaut) démographies explicites Shounen/Shoujo/
 *    Seinen/Josei : la correspondance AniList↔MAL par nom est trop peu fiable
 *    pour 3 000+ persos — la classification utilise les genres AniList
 *    (Action/Adventure → shonen). Cf. pipeline/README.md.
 * Cadence : ~3 req/s → intervalle de sécurité de 350 ms. Aucun scraping.
 * ============================================================================
 */

import { CircuitBreaker, RateLimiter, withRetry } from './ratelimit';

const BASE_URL = 'https://api.jikan.moe/v4';
export const JIKAN_MIN_INTERVAL_MS = 350;

export class JikanError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'JikanError';
  }
}

interface JikanCharacterSearchItem {
  images?: { jpg?: { image_url?: string } };
}

interface JikanAnimeSearchItem {
  title?: string;
  title_english?: string | null;
  demographics?: Array<{ name?: string }>;
}

export interface DemographicMatch {
  matchedTitle: string;
  demographics: string[]; // ex. ['Shounen'] — noms MAL normalisés (capitalized)
}

export class JikanClient {
  private readonly limiter = new RateLimiter(JIKAN_MIN_INTERVAL_MS);
  private readonly breaker = new CircuitBreaker(3, 60_000);

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  /**
   * Cherche l'image du personnage MAL le plus populaire dont le nom contient
   * `name`. Retourne null si rien de probant (le perso sera exclu, logué).
   */
  async searchCharacterImage(name: string): Promise<string | null> {
    if (this.breaker.isOpen) return null; // circuit ouvert : on n'encombre pas la file
    try {
      const json = await this.limiter.execute(() =>
        this.breaker.call(() =>
          withRetry(async () => {
            const url = `${BASE_URL}/characters?q=${encodeURIComponent(name)}&limit=1&order_by=favorites&sort=desc`;
            const res = await this.fetchImpl(url, { headers: { Accept: 'application/json' } });
            if (res.status === 429 || res.status >= 500) {
              throw new JikanError(`Jikan HTTP ${res.status}`, res.status);
            }
            if (!res.ok) {
              throw new JikanError(`Jikan HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
            }
            return (await res.json()) as { data?: JikanCharacterSearchItem[] };
          }),
        ),
      );
      const image = json.data?.[0]?.images?.jpg?.image_url;
      return image ?? null;
    } catch {
      // Fallback best-effort : une indispo Jikan ne doit jamais crasher le run.
      return null;
    }
  }

  /**
   * Résout la démographie explicite (Shounen/Shoujo/Seinen/Josei) de l'anime
   * d'origine d'un personnage — rescue ciblée pour les thèmes shojo/seinen
   * qu'AniList seul ne permet pas de détecter. Best-effort : en cas d'indispo
   * ou d'absence de démographie, retourne null (le perso garde son sort).
   * CHAQUE correspondance est loguée dans le rapport pour vérification humaine
   * (le matching titre AniList → titre MAL est fuzzy).
   */
  async resolveDemographics(animeTitle: string): Promise<DemographicMatch | null> {
    if (this.breaker.isOpen) return null; // circuit ouvert : on n'encombre pas la file
    try {
      const json = await this.limiter.execute(() =>
        this.breaker.call(() =>
          withRetry(async () => {
            const url = `${BASE_URL}/anime?q=${encodeURIComponent(animeTitle)}&limit=1&order_by=members&sort=desc`;
            const res = await this.fetchImpl(url, { headers: { Accept: 'application/json' } });
            if (res.status === 429 || res.status >= 500) {
              throw new JikanError(`Jikan HTTP ${res.status}`, res.status);
            }
            if (!res.ok) {
              throw new JikanError(`Jikan HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
            }
            return (await res.json()) as { data?: JikanAnimeSearchItem[] };
          }),
        ),
      );
      const item = json.data?.[0];
      if (!item) return null;
      const demographics = (item.demographics ?? [])
        .map((d) => d.name)
        .filter((n): n is string => typeof n === 'string' && n.length > 0);
      if (demographics.length === 0) return null;
      return { matchedTitle: item.title ?? animeTitle, demographics };
    } catch {
      return null; // Jikan down / pas de démographie : on ne bloque jamais le run
    }
  }
}
