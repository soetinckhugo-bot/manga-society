/**
 * lib/server/api-helpers.ts — wrapper transversal des route handlers.
 *
 * Pipeline imposé par SPEC §2.3 (lib/server/api-helpers) et PROMPT A §9 :
 *   request_id (uuid, header entrant repris ou généré, propagé en réponse)
 *   → auth Supabase (401 'UNAUTHENTICATED')
 *   → rate limit par user ET par IP (429 'RATE_LIMITED')
 *   → validation Zod (400 'VALIDATION_ERROR')
 *   → run() : le seul endroit où l'handler parle aux RPC
 *   → mapping erreur Postgres → code métier lib/errors.ts → status HTTP
 *   → log structuré JSON (method, route, user_id, status, duration_ms,
 *     request_id).
 *
 * La réponse d'erreur est TOUJOURS `{ error: AppErrorCode }` — jamais de
 * message, stack trace ou détail SQL (standard commun n°2).
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import type { z } from 'zod';

import {
  httpStatusForError,
  type AppErrorCode,
} from '@/lib/errors';
import { getRequestAuth } from '@/lib/server/auth';
import { createLogger, resolveRequestId, type Logger } from '@/lib/server/logger';
import { getRateLimiter, type RateLimitPolicy } from '@/lib/server/ratelimit';
import type { Database } from '@/types/database';

/** Erreur métier volontaire levée par un handler (code déjà dans l'enum). */
export class ApiError extends Error {
  constructor(readonly code: AppErrorCode) {
    super(code);
    this.name = 'ApiError';
  }
}

export interface ApiContext<TUser extends User | null = User> {
  supabase: SupabaseClient<Database>;
  /** null uniquement en mode d'auth 'optional' / 'public'. */
  user: TUser;
  requestId: string;
  ip: string;
  logger: Logger;
}

/** 'required' (défaut) : 401 sans session. 'optional'/'public' : user null. */
export type AuthMode = 'required' | 'optional' | 'public';

interface HandleApiOptions<TInput, TUser extends User | null = User> {
  /** Route loggée, ex. '/api/boosters/open' (le path, pas l'URL). */
  route: string;
  /** Schéma Zod partagé (lib/validations) — validation du corps ou query. */
  schema?: z.ZodType<TInput>;
  /** 'body' (défaut pour POST) ou 'query' (GET avec searchParams). */
  parseFrom?: 'body' | 'query';
  /** Policy rate limit ; défaut = 'mutation' (POST) / 'read' (GET). */
  rateLimit?: RateLimitPolicy;
  /** Mode d'auth ; défaut 'required' (comportement historique). */
  auth?: AuthMode;
  run: (ctx: ApiContext<TUser>, input: TInput) => Promise<{ status?: number; body: unknown }>;
}

function jsonResponse(
  body: unknown,
  status: number,
  requestId: string,
  extraHeaders?: Record<string, string>,
): Response {
  return Response.json(body, {
    status,
    headers: { 'x-request-id': requestId, ...extraHeaders },
  });
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Mapping erreur Postgres (RAISE EXCEPTION dans les RPC) → code métier.
// PostgREST renvoie les exceptions PL/pgSQL en 400 avec message = texte
// levé (ex. "NO_BOOSTER"). Les codes présents dans lib/errors.ts sont
// mappés à l'identique ; les autres font l'objet d'une demande d'extension
// dans HANDOFF.md (lib/errors.ts est en lecture seule pour l'Agent A) et
// reçoivent un mapping conservateur documenté ici :
//   - 'IDEMPOTENCY_IN_PROGRESS' → 429 'RATE_LIMITED' (même clé rejouée
//     pendant que l'appel initial est en cours : le client doit réessayer,
//     c'est la sémantique exacte du 429) ;
//   - tout autre code inconnu → 500 'INTERNAL_ERROR' (aucune fuite, log
//     serveur avec le code brut).
// ---------------------------------------------------------------------------

const RPC_CODE_RE = /^([A-Z][A-Z0-9_]{2,})/;

const RPC_DIRECT_MAP: Record<string, AppErrorCode> = {
  NO_BOOSTER: 'NO_BOOSTER',
  INVALID_THEME: 'INVALID_THEME',
  NOT_ENOUGH_POINTS: 'NOT_ENOUGH_POINTS',
  ALREADY_CLAIMED: 'ALREADY_CLAIMED',
  WISHLIST_FULL: 'WISHLIST_FULL',
  INSUFFICIENT_CHAKRA: 'INSUFFICIENT_CHAKRA',
  NOT_OWNER: 'NOT_OWNER',
  CARD_NOT_FOUND: 'CARD_NOT_FOUND',
  CHARACTER_NOT_FOUND: 'CHARACTER_NOT_FOUND',
  COSMETIC_NOT_FOUND: 'COSMETIC_NOT_FOUND',
  THEME_NOT_FOUND: 'THEME_NOT_FOUND',
  QUEST_NOT_FOUND: 'QUEST_NOT_FOUND',
  COSMETIC_NOT_OWNED: 'COSMETIC_NOT_OWNED',
  COSMETIC_SLOT_TAKEN: 'COSMETIC_SLOT_TAKEN',
  INVALID_COSMETIC_TYPE: 'INVALID_COSMETIC_TYPE',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  INVALID_USERNAME: 'INVALID_USERNAME',
  PROFILE_NOT_FOUND: 'PROFILE_NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
};

export interface MappedError {
  code: AppErrorCode;
  /** Code brut RPC (pour le log serveur, jamais pour le client). */
  rawCode?: string;
}

export function mapErrorToAppCode(error: unknown): MappedError {
  if (error instanceof ApiError) return { code: error.code };

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    const match = RPC_CODE_RE.exec(message);
    if (match) {
      const raw = match[1] as string;
      const direct = RPC_DIRECT_MAP[raw];
      if (direct) return { code: direct, rawCode: raw };
      if (raw === 'IDEMPOTENCY_IN_PROGRESS') return { code: 'RATE_LIMITED', rawCode: raw };
      return { code: 'INTERNAL_ERROR', rawCode: raw };
    }
  }

  return { code: 'INTERNAL_ERROR' };
}

/** Entrée unique de tous les route handlers — voir le pipeline en tête.
 *
 * Overloads typés : 'required' (défaut) → ctx.user: User ; 'optional' /
 * 'public' → ctx.user: User | null.
 */
export function handleApi<TInput>(
  request: NextRequest,
  options: HandleApiOptions<TInput, User> & { auth?: 'required' },
): Promise<Response>;
export function handleApi<TInput>(
  request: NextRequest,
  options: HandleApiOptions<TInput, User | null> & { auth: 'optional' | 'public' },
): Promise<Response>;
export async function handleApi<TInput>(
  request: NextRequest,
  options: HandleApiOptions<TInput, never>,
): Promise<Response> {
  const start = Date.now();
  const requestId = resolveRequestId(request);
  const logger = createLogger(requestId);
  const ip = clientIp(request);
  const method = request.method;
  const { route } = options;
  const authMode = options.auth ?? 'required';

  const finishLog = (
    status: number,
    userId: string | null,
    errorCode?: string,
  ): void => {
    const fields = {
      method,
      route,
      user_id: userId,
      status,
      duration_ms: Date.now() - start,
      ...(errorCode ? { error_code: errorCode } : {}),
    };
    if (status >= 500) {
      logger.error({ ...fields, message: 'request_failed' });
    } else {
      logger.info({ ...fields, message: 'request_done' });
    }
  };

  // (1) Auth — requireUser() côté handler, jamais dans middleware (SPEC règle 7).
  // 'required' (défaut) : 401 sans session ; 'optional'/'public' : user null,
  // le client reste utilisable (lectures anon pour les routes publiques).
  const auth = await getRequestAuth();
  const user = auth.user;
  if (authMode === 'required' && !user) {
    finishLog(401, null, 'UNAUTHENTICATED');
    return jsonResponse({ error: 'UNAUTHENTICATED' }, 401, requestId);
  }
  const userId = user?.id ?? null;

  // (2) Rate limit — user (si session) ET IP (les deux doivent avoir un jeton).
  const policy: RateLimitPolicy =
    options.rateLimit ?? (method === 'GET' ? 'read' : 'mutation');
  const limiter = getRateLimiter();
  const byIp = limiter.consume(`ip:${ip}`, policy);
  const byUser = userId ? limiter.consume(`u:${userId}`, policy) : { allowed: true, retryAfterMs: 0 };
  const blocked = !byUser.allowed ? byUser : byIp;
  if (!blocked.allowed) {
    const retrySeconds = Math.max(1, Math.ceil(blocked.retryAfterMs / 1000));
    finishLog(429, userId, 'RATE_LIMITED');
    return jsonResponse(
      { error: 'RATE_LIMITED' },
      429,
      requestId,
      { 'retry-after': String(retrySeconds) },
    );
  }

  // (3) Validation Zod (même schéma client/serveur — standard commun n°2).
  let rawInput: unknown;
  if (options.parseFrom === 'query') {
    rawInput = Object.fromEntries(request.nextUrl.searchParams.entries());
  } else if (method !== 'GET' && method !== 'HEAD') {
    try {
      rawInput = await request.json();
    } catch {
      finishLog(400, userId, 'VALIDATION_ERROR');
      return jsonResponse({ error: 'VALIDATION_ERROR' }, 400, requestId);
    }
  }

  let input: TInput = rawInput as TInput;
  if (options.schema) {
    const parsed = options.schema.safeParse(rawInput);
    if (!parsed.success) {
      finishLog(400, userId, 'VALIDATION_ERROR');
      return jsonResponse({ error: 'VALIDATION_ERROR' }, 400, requestId);
    }
    input = parsed.data;
  }

  // (4) Handler + (5) mapping erreur → réponse propre.
  const ctx: ApiContext<User | null> = { supabase: auth.supabase, user, requestId, ip, logger };
  try {
    // La variance des overloads ('required' vs 'optional'/'public') impose
    // TUser = never dans la signature d'implémentation — le ctx construit ici
    // est conforme aux deux familles de signatures.
    const result = await options.run(ctx as ApiContext<never>, input);
    const status = result.status ?? 200;
    finishLog(status, userId);
    return jsonResponse(result.body, status, requestId);
  } catch (error) {
    const { code, rawCode } = mapErrorToAppCode(error);
    const status = httpStatusForError(code);
    if (status >= 500) {
      // Détail serveur uniquement (message d'exception, jamais au client).
      logger.error({
        method,
        route,
        user_id: userId,
        status,
        duration_ms: Date.now() - start,
        error_code: rawCode ?? code,
        message: error instanceof Error ? error.message : 'unknown_error',
      });
    } else if (rawCode) {
      logger.warn({
        method,
        route,
        user_id: userId,
        status,
        duration_ms: Date.now() - start,
        error_code: rawCode,
        message: 'rpc_error',
      });
    }
    return jsonResponse({ error: code }, status, requestId);
  }
}
