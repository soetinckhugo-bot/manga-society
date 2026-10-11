/**
 * ============================================================================
 * MANGA SOCIETY — pipeline de données (Agent C)
 * Rate limiter local (file d'attente à intervalle minimum), circuit breaker et
 * retry à backoff exponentiel + jitter. Le cœur de la résilience : les
 * fournisseurs (AniList 30 req/min, Jikan ~3 req/s) bannissent en cas
 * d'abus — on ne dépasse JAMAIS les cadences, et on survit aux 429/5xx.
 * ============================================================================
 */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * File d'attente FIFO : chaque job démarre au moins `minIntervalMs` après le
 * précédent. Une seule pompe, ordre FIFO garanti, les erreurs d'un job
 * n'arrêtent pas la file.
 */
export class RateLimiter {
  private readonly queue: Array<() => Promise<void>> = [];
  private pumping = false;
  private lastRun = 0;

  constructor(private readonly minIntervalMs: number) {}

  get pending(): number {
    return this.queue.length;
  }

  execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      do {
        const job = this.queue.shift();
        if (!job) break;
        const wait = this.minIntervalMs - (Date.now() - this.lastRun);
        if (wait > 0) await sleep(wait);
        this.lastRun = Date.now();
        await job(); // await : on ne chevauche jamais deux jobs
      } while (this.queue.length > 0);
    } finally {
      this.pumping = false;
      // Course possible : un job poussé entre la dernière vérif et pumping=false.
      if (this.queue.length > 0) void this.pump();
    }
  }
}

/**
 * Circuit breaker : après `threshold` échecs consécutifs, on refuse tout appel
 * pendant `cooldownMs` (pause 60 s par défaut, cf. PROMPT C). Un succès remet
 * le compteur à zéro.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedUntil = 0;

  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 60_000,
  ) {}

  get isOpen(): boolean {
    return Date.now() < this.openedUntil;
  }

  get failureCount(): number {
    return this.failures;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen) throw new Error('CIRCUIT_OPEN');
    try {
      const result = await fn();
      this.failures = 0;
      return result;
    } catch (err) {
      this.failures += 1;
      if (this.failures >= this.threshold) {
        this.openedUntil = Date.now() + this.cooldownMs;
      }
      throw err;
    }
  }
}

export interface RetryOptions {
  retries?: number; // nb de TENTATIVES supplémentaires après l'échec initial
  baseMs?: number;
  maxMs?: number;
  jitterRatio?: number; // fraction aléatoire ajoutée au délai (0.3 = ±30 %)
  shouldRetry?: (err: unknown) => boolean;
  onRetry?: (attempt: number, err: unknown) => void;
}

/** Retryable par défaut : 429 (rate limit), 5xx, et erreurs réseau (fetch rejeté). */
export function defaultShouldRetry(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch échoué (DNS/socket) — réseau
  const status = (err as { status?: unknown }).status;
  return status === 429 || (typeof status === 'number' && status >= 500);
}

/**
 * Exécute `fn` avec retries à backoff exponentiel + jitter complet.
 * Non retryable (4xx, validation…) → l'erreur est relancée immédiatement.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const {
    retries = 4,
    baseMs = 1_000,
    maxMs = 30_000,
    jitterRatio = 0.3,
    shouldRetry = defaultShouldRetry,
    onRetry,
  } = opts;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      attempt += 1;
      const backoff = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      const jitter = backoff * jitterRatio * Math.random();
      onRetry?.(attempt, err);
      await sleep(backoff + jitter);
    }
  }
}
