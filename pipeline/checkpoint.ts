/**
 * ============================================================================
 * MANGA SOCIETY — pipeline de données (Agent C)
 * Checkpoint sur disque : curseur de parcours par source → `--resume` reprend
 * exactement où le run s'est arrêté (crash, circuit breaker, Ctrl+C) SANS
 * doublon — l'upsert sur `anilist_id` reste le filet ultime côté base.
 * Le checkpoint n'est sauvegardé qu'APRÈS traitement réussi d'une page.
 * ============================================================================
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type CursorMode = 'global' | 'alpha';

export interface Checkpoint {
  mode: CursorMode;
  letterIndex: number; // index dans ALPHABET (mode 'alpha')
  page: number; // PROCHAINE page à fetcher
  updatedAt: string; // ISO
}

export const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('') as string[];

export const FRESH_CHECKPOINT: Checkpoint = { mode: 'global', letterIndex: 0, page: 1, updatedAt: '' };

export function loadCheckpoint(path: string): Checkpoint | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<Checkpoint>;
    if (raw && typeof raw.page === 'number' && typeof raw.letterIndex === 'number') {
      return {
        mode: raw.mode === 'alpha' ? 'alpha' : 'global',
        letterIndex: raw.letterIndex,
        page: raw.page,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
      };
    }
    return null;
  } catch {
    return null; // absent ou corrompu : on repart de zéro (l'upsert garantit l'idempotence)
  }
}

/** Écriture atomique (tmp + rename) : un crash pendant l'écriture ne corrompt pas le curseur. */
export function saveCheckpoint(path: string, cp: Checkpoint): void {
  const full: Checkpoint = { ...cp, updatedAt: new Date().toISOString() };
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(full, null, 2), 'utf8');
  renameSync(tmp, path);
}
