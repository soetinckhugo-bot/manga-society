/**
 * Tests unitaires de la résilience (pipeline/ratelimit.ts) :
 * file d'attente à intervalle minimum, circuit breaker, retry backoff+jitter.
 */
import { describe, expect, it } from 'vitest';

import { CircuitBreaker, RateLimiter, withRetry } from './ratelimit';

describe('RateLimiter — file d\'attente FIFO à intervalle minimum', () => {
  it('espace les appels d\'au moins minIntervalMs', async () => {
    const limiter = new RateLimiter(50);
    const timestamps: number[] = [];
    const job = async (): Promise<number> => {
      timestamps.push(Date.now());
      return timestamps.length;
    };
    await Promise.all([limiter.execute(job), limiter.execute(job), limiter.execute(job)]);
    expect(timestamps).toHaveLength(3);
    expect(timestamps[1]! - timestamps[0]!).toBeGreaterThanOrEqual(45); // marge horloge
    expect(timestamps[2]! - timestamps[1]!).toBeGreaterThanOrEqual(45);
  });

  it('l\'ordre FIFO est préservé et une erreur n\'arrête pas la file', async () => {
    const limiter = new RateLimiter(1);
    const order: string[] = [];
    // allSettled + drain : Promise.all rejette à la première erreur, avant que
    // la pompe (timer entre jobs) n'ait traité le job suivant.
    await Promise.allSettled([
      limiter.execute(async () => {
        order.push('a');
        return 'A';
      }),
      limiter.execute(async () => {
        order.push('b');
        throw new Error('boom');
      }),
      limiter.execute(async () => {
        order.push('c');
        return 'C';
      }),
    ]);
    await new Promise((r) => setTimeout(r, 20)); // laisse la pompe vider la file
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('un job pousse un autre job SANS l\'attendre (pas d\'await interne)', async () => {
    // Garde-fou documenté : un job ne doit JAMAIS await un autre job du MÊME
    // limiter (file FIFO sérielle = deadlock par construction). Le pipeline
    // respecte cette règle : limiters AniList/Jikan séparés, aucun enqueue
    // pendant l'exécution d'un job.
    const limiter = new RateLimiter(1);
    const done: string[] = [];
    let second: Promise<string> | null = null;
    const first = limiter.execute(async (): Promise<string> => {
      done.push('first');
      second = limiter.execute(async () => {
        done.push('second');
        return 'SECOND';
      });
      return 'FIRST';
    });
    expect(await first).toBe('FIRST');
    expect(await second).toBe('SECOND');
    expect(done).toEqual(['first', 'second']);
  });
});

describe('CircuitBreaker — 3 échecs → pause', () => {
  it('ouvre après le seuil d\'échecs consécutifs', async () => {
    const breaker = new CircuitBreaker(3, 10_000);
    const fail = (): Promise<never> => Promise.reject(new Error('down'));
    await expect(breaker.call(fail)).rejects.toThrow('down');
    await expect(breaker.call(fail)).rejects.toThrow('down');
    await expect(breaker.call(fail)).rejects.toThrow('down'); // 3e échec → ouverture
    await expect(breaker.call(() => Promise.resolve('ok'))).rejects.toThrow('CIRCUIT_OPEN');
    expect(breaker.isOpen).toBe(true);
  });

  it('un succès remet le compteur à zéro', async () => {
    const breaker = new CircuitBreaker(3, 10_000);
    await expect(breaker.call(() => Promise.reject(new Error('down')))).rejects.toThrow('down');
    await expect(breaker.call(() => Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(await breaker.call(() => Promise.resolve('ok'))).toBe('ok'); // reset
    await expect(breaker.call(() => Promise.reject(new Error('down')))).rejects.toThrow('down');
    await expect(breaker.call(() => Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(breaker.isOpen).toBe(false); // toujours 2 échecs consécutifs < seuil 3
  });

  it('se referme après le cooldown', async () => {
    const breaker = new CircuitBreaker(1, 30);
    await expect(breaker.call(() => Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(breaker.isOpen).toBe(true);
    await new Promise((r) => setTimeout(r, 40));
    expect(await breaker.call(() => Promise.resolve('ok'))).toBe('ok');
  });
});

describe('withRetry — backoff exponentiel + jitter', () => {
  it('retry sur 429 et 5xx, abandon sur 4xx', async () => {
    let attempts429 = 0;
    await withRetry(
      async () => {
        attempts429 += 1;
        if (attempts429 < 3) {
          const err = new Error('HTTP 429') as Error & { status: number };
          err.status = 429;
          throw err;
        }
        return 'ok';
      },
      { baseMs: 1, maxMs: 5 },
    );
    expect(attempts429).toBe(3);

    let attempts400 = 0;
    await expect(
      withRetry(
        async () => {
          attempts400 += 1;
          const err = new Error('HTTP 400') as Error & { status: number };
          err.status = 400;
          throw err;
        },
        { baseMs: 1 },
      ),
    ).rejects.toThrow('HTTP 400');
    expect(attempts400).toBe(1); // non retryable : aucune nouvelle tentative
  });

  it('épuise les retries puis relance la dernière erreur', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          const err = new Error('HTTP 500') as Error & { status: number };
          err.status = 500;
          throw err;
        },
        { retries: 2, baseMs: 1, maxMs: 5 },
      ),
    ).rejects.toThrow('HTTP 500');
    expect(attempts).toBe(3); // 1 initial + 2 retries
  });
});
