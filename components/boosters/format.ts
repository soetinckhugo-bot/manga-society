import { toast } from 'sonner';

import { ApiError } from '@/lib/query/api';
import type { AppErrorCode } from '@/lib/errors';

/**
 * Helpers partagés des sections boosters — formatage d'horloge cosmétique
 * et traduction des erreurs API (le serveur ne renvoie qu'un code).
 */

/** Horloge "mm:ss" (ou "h:mm:ss" au-delà d'une heure), affichage uniquement. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(Math.floor(totalSeconds), 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(rest).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Toast d'erreur à partir d'une erreur inconnue : ApiError → code, sinon 500. */
export function toastApiError(
  t: (code: AppErrorCode) => string,
  error: unknown,
): void {
  const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
  toast.error(t(code));
}
