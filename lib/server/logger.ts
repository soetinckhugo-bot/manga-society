/**
 * lib/server/logger.ts — logger JSON structuré pour les route handlers.
 *
 * Une ligne JSON par événement sur stdout/stderr (méthode standard sur
 * Vercel/CI), jamais de console.log ad hoc. Le request_id (uuid v4, ou repris
 * depuis le header x-request-id entrant) est propagé en header de réponse et
 * accolé à chaque ligne : un log est toujours rattachable à une requête.
 * Aucune donnée sensible (email, clé, cookie) ne sort ici — seulement des
 * ids et compteurs (même règle que les RPC).
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogFields {
  request_id: string;
  method: string;
  route: string;
  user_id?: string | null;
  status?: number;
  duration_ms?: number;
  error_code?: string;
  message?: string;
}

function emit(level: LogLevel, fields: LogFields): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), ...fields });
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export interface Logger {
  info(fields: Omit<LogFields, 'request_id'> & { message: string }): void;
  warn(fields: Omit<LogFields, 'request_id'> & { message: string; error_code?: string }): void;
  error(fields: Omit<LogFields, 'request_id'> & { message: string; error_code?: string }): void;
}

/** Logger boundé à un request_id — créé en entrée de chaque handler. */
export function createLogger(requestId: string): Logger {
  return {
    info: (f) => emit('info', { ...f, request_id: requestId }),
    warn: (f) => emit('warn', { ...f, request_id: requestId }),
    error: (f) => emit('error', { ...f, request_id: requestId }),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * request_id de la requête : repris du header entrant s'il est un uuid
 * valide (traçabilité traversante), sinon généré.
 */
export function resolveRequestId(request: Request): string {
  const incoming = request.headers.get('x-request-id');
  if (incoming && UUID_RE.test(incoming)) return incoming;
  return crypto.randomUUID();
}
