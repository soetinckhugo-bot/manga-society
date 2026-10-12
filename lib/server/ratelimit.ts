/**
 * lib/server/ratelimit.ts — rate limiting en mémoire (token bucket), par
 * user ET par IP.
 *
 * SPEC §2.3 : interface swappable — l'implémentation V1 est un token bucket
 * en mémoire par instance (Next.js serverless = par fonction/isolat, suffisant
 * en V1) ; brancher Upstash plus tard = implémenter RateLimiter et
 * setRateLimiter() sans toucher aux handlers.
 *
 * Limites (infra, pas équilibrage de jeu — ne pas les déplacer dans
 * lib/config.ts qui est réservé à l'économie) :
 *   - 'open'     : 1 ouverture de booster / 2 s  (SPEC §5.1, étape 6)
 *   - 'mutation' : 5 mutations / s (burn, achat, toggle… — léger)
 *   - 'read'     : 30 lectures / s (polling state toutes les 30 s : très large)
 * La règle dorée : user ET IP doivent tous deux avoir un jeton (un client
 * authentifié ne contourne pas une IP bannie et vice versa).
 */

export type RateLimitPolicy = 'open' | 'mutation' | 'read';

interface Policy {
  /** Taille du seau (= rafale instantanée tolérée). */
  capacity: number;
  /** Taux de recharge en jetons/seconde. */
  refillPerSecond: number;
}

export const RATE_LIMIT_POLICIES: Record<RateLimitPolicy, Policy> = {
  open: { capacity: 1, refillPerSecond: 0.5 },
  mutation: { capacity: 5, refillPerSecond: 5 },
  read: { capacity: 30, refillPerSecond: 30 },
};

export interface RateLimitResult {
  allowed: boolean;
  /** Délai à attendre avant un nouvel essai (ms) — 0 si autorisé. */
  retryAfterMs: number;
}

export interface RateLimiter {
  consume(key: string, policy: RateLimitPolicy): RateLimitResult;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

/** Fenêtre au-delà de laquelle un seau plein inactif est purgé. */
const STALE_AFTER_MS = 10 * 60 * 1000;
const SWEEP_THRESHOLD = 10_000;

class MemoryTokenBucketLimiter implements RateLimiter {
  private buckets = new Map<string, Bucket>();

  consume(key: string, policy: RateLimitPolicy): RateLimitResult {
    const { capacity, refillPerSecond } = RATE_LIMIT_POLICIES[policy];
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: capacity, lastRefillMs: now };
      this.buckets.set(key, bucket);
    } else {
      const refill = ((now - bucket.lastRefillMs) / 1000) * refillPerSecond;
      bucket.tokens = Math.min(capacity, bucket.tokens + refill);
      bucket.lastRefillMs = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.maybeSweep(now);
      return { allowed: true, retryAfterMs: 0 };
    }

    const retryAfterMs = Math.ceil(((1 - bucket.tokens) / refillPerSecond) * 1000);
    this.maybeSweep(now);
    return { allowed: false, retryAfterMs };
  }

  /** Purge opportuniste des seaux inactifs (borne mémoire). */
  private maybeSweep(now: number): void {
    if (this.buckets.size < SWEEP_THRESHOLD) return;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefillMs > STALE_AFTER_MS) {
        this.buckets.delete(key);
      }
    }
  }
}

let instance: RateLimiter = new MemoryTokenBucketLimiter();

/** Instance applicée par les handlers (singleton mémoire en V1). */
export function getRateLimiter(): RateLimiter {
  return instance;
}

/** Injection d'une implémentation distante (Upstash) sans toucher aux handlers. */
export function setRateLimiter(limiter: RateLimiter): void {
  instance = limiter;
}
