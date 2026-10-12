import {
  isAppErrorCode,
  type AppErrorCode,
} from '@/lib/errors';
import type {
  ApplyCosmeticRequest,
  ApplyCosmeticResponse,
  BurnCardRequest,
  BurnCardResponse,
  BuyCosmeticRequest,
  BuyCosmeticResponse,
  ClaimDailyPackRequest,
  ClaimDailyPackResponse,
  ClaimQuestsRequest,
  ClaimQuestsResponse,
  CollectionQueryParams,
  GetAlbumResponse,
  GetBoosterStateResponse,
  GetCardResponse,
  GetCollectionResponse,
  GetQuestsResponse,
  GetThemePoolInfoResponse,
  GetWishlistResponse,
  OpenBoosterRequest,
  OpenBoosterResponse,
  OpenPremiumBoosterRequest,
  OpenPremiumBoosterResponse,
  RerollCosmeticRequest,
  RerollCosmeticResponse,
  ToggleWishlistRequest,
  ToggleWishlistResponse,
} from '@/types/api';

/**
 * lib/query/api.ts — client API typé, codé CONTRE types/api.ts (contrat A↔B).
 *
 * RÈGLES (SPEC) :
 * - Le serveur ne renvoie JAMAIS de message, seulement `{ error: AppErrorCode }`
 *   → le client traduit via next-intl (namespace `errors`).
 * - AUCUNE logique d'économie ici : les soldes/compteurs renvoyés par les
 *   réponses sont la vérité serveur ; l'UI se resync par invalidateQueries.
 * - L'`idempotency_key` est générée par l'APPELANT À CHAQUE clic
 *   (`crypto.randomUUID()`), jamais réutilisée entre deux tentatives.
 */

/** Erreur métier transportée : code (traduit par l'UI) + statut HTTP. */
export class ApiError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(code: AppErrorCode, status: number) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let code: AppErrorCode = 'INTERNAL_ERROR';
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === 'string' && isAppErrorCode(body.error)) {
        code = body.error;
      }
    } catch {
      // Corps illisible : INTERNAL_ERROR par défaut.
    }
    throw new ApiError(code, response.status);
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Boosters
// ---------------------------------------------------------------------------

/** queryKey du polling du panneau boosters (30 s, SPEC §7). */
export const boosterStateQueryKey = ['booster-state'] as const;

export function getBoosterState(): Promise<GetBoosterStateResponse> {
  return request<GetBoosterStateResponse>('/api/boosters/state');
}

export function openBooster(
  input: OpenBoosterRequest,
): Promise<OpenBoosterResponse> {
  return request<OpenBoosterResponse>('/api/boosters/open', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function openPremiumBooster(
  input: OpenPremiumBoosterRequest,
): Promise<OpenPremiumBoosterResponse> {
  return request<OpenPremiumBoosterResponse>('/api/boosters/open-premium', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function claimDailyPack(
  input: ClaimDailyPackRequest,
): Promise<ClaimDailyPackResponse> {
  return request<ClaimDailyPackResponse>('/api/boosters/daily', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Cartes / collection
// ---------------------------------------------------------------------------

export function burnCard(input: BurnCardRequest): Promise<BurnCardResponse> {
  return request<BurnCardResponse>('/api/cards/burn', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getCollection(
  params: CollectionQueryParams = {},
): Promise<GetCollectionResponse> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return request<GetCollectionResponse>(
    `/api/collection${query ? `?${query}` : ''}`,
  );
}

export function getAlbum(): Promise<GetAlbumResponse> {
  return request<GetAlbumResponse>('/api/collection/album');
}

export function getCard(cardId: string): Promise<GetCardResponse> {
  return request<GetCardResponse>(`/api/cards/${encodeURIComponent(cardId)}`);
}

// ---------------------------------------------------------------------------
// Quêtes
// ---------------------------------------------------------------------------

export function getQuests(): Promise<GetQuestsResponse> {
  return request<GetQuestsResponse>('/api/quests');
}

export function claimQuests(
  input: ClaimQuestsRequest,
): Promise<ClaimQuestsResponse> {
  return request<ClaimQuestsResponse>('/api/quests/claim', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Shop / cosmétiques
// ---------------------------------------------------------------------------

export function buyCosmetic(
  input: BuyCosmeticRequest,
): Promise<BuyCosmeticResponse> {
  return request<BuyCosmeticResponse>('/api/shop/buy', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function applyCosmetic(
  cardId: string,
  input: Omit<ApplyCosmeticRequest, 'card_id'>,
): Promise<ApplyCosmeticResponse> {
  return request<ApplyCosmeticResponse>(
    `/api/cards/${encodeURIComponent(cardId)}/apply-cosmetic`,
    {
      method: 'POST',
      body: JSON.stringify({ ...input, card_id: cardId }),
    },
  );
}

export function rerollCosmetic(
  cardId: string,
  input: Omit<RerollCosmeticRequest, 'card_id'>,
): Promise<RerollCosmeticResponse> {
  return request<RerollCosmeticResponse>(
    `/api/cards/${encodeURIComponent(cardId)}/reroll-cosmetic`,
    {
      method: 'POST',
      body: JSON.stringify({ ...input, card_id: cardId }),
    },
  );
}

// ---------------------------------------------------------------------------
// Wishlist / thèmes
// ---------------------------------------------------------------------------

export function toggleWishlist(
  input: ToggleWishlistRequest,
): Promise<ToggleWishlistResponse> {
  return request<ToggleWishlistResponse>('/api/wishlist/toggle', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getWishlist(): Promise<GetWishlistResponse> {
  return request<GetWishlistResponse>('/api/wishlist');
}

export function getThemePoolInfo(
  slug: string,
): Promise<GetThemePoolInfoResponse> {
  return request<GetThemePoolInfoResponse>(
    `/api/themes/${encodeURIComponent(slug)}/pool-info`,
  );
}
