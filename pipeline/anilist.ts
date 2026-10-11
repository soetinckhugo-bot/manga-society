/**
 * ============================================================================
 * MANGA SOCIETY — pipeline de données (Agent C)
 * Client GraphQL AniList — SANS clé. Rate limit dégradé respecté scrupuleusement
 * (30 req/min → intervalle de sécurité de 2,1 s), retries 429/5xx + circuit
 * breaker. Aucun scraping : uniquement l'API publique officielle.
 * ============================================================================
 */

import { CircuitBreaker, RateLimiter, withRetry } from './ratelimit';
import type { MediaInfo, RawCharacter } from './types';

const API_URL = 'https://graphql.anilist.co';
export const PER_PAGE = 50; // maximum autorisé par l'API AniList

/** Cadence dégradée sans clé : 30 req/min → on se marge à 2,1 s entre requêtes. */
export const ANILIST_MIN_INTERVAL_MS = 2_100;

const PAGE_QUERY = /* GraphQL */ `
  query PipelineCharacters($search: String, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        hasNextPage
      }
      characters(search: $search, sort: FAVOURITES_DESC) {
        id
        name {
          full
          native
        }
        image {
          large
        }
        favourites
        media(page: 1, perPage: 5) {
          nodes {
            title {
              romaji
            }
            genres
            format
            countryOfOrigin
            isAdult
            description(asHtml: false)
          }
        }
      }
    }
  }
`;

// NOTE API : nester `media` dans Media.characters.nodes renvoie un HTTP 500
// côté AniList (bug serveur vérifié) — la requête anime ne prend donc QUE les
// champs simples ; les media sont récupérés par Character(id:) de premier
// niveau (même shape que le parcours principal, qui lui fonctionne).
const ANIME_QUERY = /* GraphQL */ `
  query PipelineAnimeCharacters($search: String) {
    Media(search: $search, type: ANIME) {
      title {
        romaji
      }
      characters(page: 1, perPage: 25, role: MAIN, sort: [FAVOURITES_DESC]) {
        nodes {
          id
        }
      }
    }
  }
`;

const CHARACTER_QUERY = /* GraphQL */ `
  query PipelineCharacter($id: Int) {
    Character(id: $id) {
      id
      name {
        full
        native
      }
      image {
        large
      }
      favourites
      media(page: 1, perPage: 5) {
        nodes {
          title {
            romaji
          }
          genres
          format
          countryOfOrigin
          isAdult
          description(asHtml: false)
        }
      }
    }
  }
`;

interface AniListCharacterNode {
  id: number;
  name: { full: string | null; native: string | null };
  image: { large: string | null } | null;
  favourites: number | null;
  media?: { nodes: AniListMediaNode[] | null } | null;
}

interface AniListMediaNode {
  title: { romaji: string | null } | null;
  genres: string[] | null;
  format: string | null;
  countryOfOrigin: string | null;
  isAdult: boolean | null;
  description: string | null;
}

function toMediaInfo(node: AniListMediaNode): MediaInfo {
  return {
    titleRomaji: node.title?.romaji ?? null,
    genres: node.genres ?? [],
    format: node.format,
    countryOfOrigin: node.countryOfOrigin,
    isAdult: node.isAdult ?? false,
    synopsis: node.description,
  };
}

function toRawCharacter(node: AniListCharacterNode): RawCharacter {
  return {
    anilistId: node.id,
    nameRomaji: node.name.full ?? node.name.native ?? `AniList #${node.id}`,
    nameNative: node.name.native,
    imageUrl: node.image?.large ?? null,
    favourites: node.favourites ?? 0,
    media: (node.media?.nodes ?? []).map(toMediaInfo),
    demographics: [], // démographies Jikan : résolution optionnelle (cf. README)
  };
}

export interface CharactersPage {
  characters: RawCharacter[];
  hasNextPage: boolean;
}

interface AniListResponse {
  data?: {
    Page?: { pageInfo?: { hasNextPage?: boolean }; characters?: AniListCharacterNode[] };
    Media?: { title?: { romaji?: string }; characters?: { nodes?: Array<{ id?: number }> } };
    Character?: AniListCharacterNode;
  };
  errors?: Array<{ message: string }>;
}

export class AniListError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AniListError';
  }
}

export class AniListClient {
  private readonly limiter = new RateLimiter(ANILIST_MIN_INTERVAL_MS);
  private readonly breaker = new CircuitBreaker(3, 60_000);

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  /** Une page de personnages. `search` vide/omis = parcours global par favourites. */
  async fetchCharactersPage(search: string, page: number): Promise<CharactersPage> {
    // AniList renvoie 0 résultat pour search:"" : il faut OMETTRE la variable.
    const variables: Record<string, unknown> = { page, perPage: PER_PAGE };
    if (search.length > 0) variables.search = search;
    const json = await this.limiter.execute(() =>
      this.breaker.call(() => this.request(PAGE_QUERY, variables)),
    );
    const pg = json.data?.Page;
    if (!pg) throw new Error('AniList: réponse Page absente');
    return {
      characters: (pg.characters ?? []).map((c: AniListCharacterNode) => toRawCharacter(c)),
      hasNextPage: pg.pageInfo?.hasNextPage ?? false,
    };
  }

  /** Personnages principaux d'un anime (--anime="Jujutsu Kaisen"). */
  async fetchCharactersByAnime(title: string): Promise<RawCharacter[]> {
    const json = await this.limiter.execute(() =>
      this.breaker.call(() => this.request(ANIME_QUERY, { search: title })),
    );
    const media = json.data?.Media;
    if (!media) return [];
    const ids = (media.characters?.nodes ?? [])
      .map((c: { id?: number }) => c.id)
      .filter((id: number | undefined): id is number => typeof id === 'number');
    // Enrichissement un par un via Character(id:) — cf. note API plus haut.
    const characters: RawCharacter[] = [];
    for (const id of ids) {
      try {
        const detail = await this.limiter.execute(() =>
          this.breaker.call(() => this.request(CHARACTER_QUERY, { id })),
        );
        const node = detail.data?.Character;
        if (node) characters.push(toRawCharacter(node));
      } catch {
        // Un perso en échec ne bloque pas les autres.
      }
    }
    return characters;
  }

  private async request(query: string, variables: Record<string, unknown>): Promise<AniListResponse> {
    return withRetry(async () => {
      const res = await this.fetchImpl(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new AniListError(`AniList HTTP ${res.status}`, res.status);
      }
      if (!res.ok) {
        throw new AniListError(`AniList HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
      }
      const json = (await res.json()) as AniListResponse;
      if (json.errors && json.errors.length > 0) {
        throw new AniListError(`AniList GraphQL: ${json.errors[0]?.message ?? 'erreur inconnue'}`, 200);
      }
      return json;
    });
  }
}
