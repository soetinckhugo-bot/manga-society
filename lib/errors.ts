/**
 * lib/errors.ts — ENUM PARTAGÉ de tous les codes d'erreur métier.
 *
 * RÈGLE ABSOLUE : le serveur ne renvoie JAMAIS de message lisible, seulement
 * un code de cet enum (`{ error: AppErrorCode }`). Le client traduit le code
 * en message via next-intl (messages/fr.json + messages/en.json). Aucune
 * chaîne ad hoc, aucun message SQL, aucun détail d'exception ne quitte le
 * serveur (standard commun n°2).
 */

export const APP_ERROR_CODES = [
  // --- Auth / session ---
  /** Utilisateur non authentifié ou session expirée (401). */
  'UNAUTHENTICATED',
  /** Username déjà pris (citext unique) lors du choix du pseudo (409). */
  'USERNAME_TAKEN',
  /** Username invalide (format longueur/caractères) (422). */
  'INVALID_USERNAME',

  // --- Validation / transport ---
  /** Corps de requête invalide selon le schéma Zod partagé (400). */
  'VALIDATION_ERROR',
  /** Trop de requêtes (token bucket : 1 open / 2 s par user ET par IP) (429). */
  'RATE_LIMITED',

  // --- Boosters / économie ---
  /** Pas de booster en stock (recharge +1 toutes les 6 min, cap 10) (409). */
  'NO_BOOSTER',
  /** Thème inconnu ou inactif au roll (422). */
  'INVALID_THEME',
  /** Pas assez de points premium (booster premium = 10 points) (409). */
  'NOT_ENOUGH_POINTS',
  /** Action déjà effectuée (pack du jour déjà claim, quête déjà claim…) (409). */
  'ALREADY_CLAIMED',
  /** Wishlist pleine (10 slots max) sur ajout (409). */
  'WISHLIST_FULL',
  /** Pas assez de chakra pour cet achat / ce reroll (409). */
  'INSUFFICIENT_CHAKRA',

  // --- Possession / ressources ---
  /** La carte ne m'appartient pas (burn, apply-cosmetic…) (409). */
  'NOT_OWNER',
  /** Carte (user_cards.id) introuvable ou pas possédée (404). */
  'CARD_NOT_FOUND',
  /** Personnage (characters.id) introuvable (404). */
  'CHARACTER_NOT_FOUND',
  /** Cosmétique (cosmetics.id) introuvable ou non en vente (404). */
  'COSMETIC_NOT_FOUND',
  /** Thème (themes.slug) introuvable (404). */
  'THEME_NOT_FOUND',
  /** Quête (quests.id) introuvable ou inactive aujourd'hui (404). */
  'QUEST_NOT_FOUND',

  // --- Cosmétiques ---
  /** Achat d'un cosmétique que le joueur ne possède pas (409). */
  'COSMETIC_NOT_OWNED',
  /** Slot déjà occupé sur la carte (une seule instance par type par carte) (409). */
  'COSMETIC_SLOT_TAKEN',
  /** Type de cosmétique incohérent avec le slot visé (frame/holo/dye) (422). */
  'INVALID_COSMETIC_TYPE',

  // --- Divers ---
  /** Erreur interne inattendue (500). Jamais de détail au client. */
  'INTERNAL_ERROR',
] as const;

/** Union étroite de tous les codes d'erreur métier. */
export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

/** Helper de typage étroit : `isAppErrorCode(x)` affûte `x` en AppErrorCode. */
export function isAppErrorCode(value: string): value is AppErrorCode {
  return (APP_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * Map code métier → statut HTTP. Utilisée par les route handlers pour
 * répondre `{ error: CODE }` avec le bon status (standard : 409 conflit
 * d'état métier, 422 domaine invalide, 401/429/400/404/500 classiques).
 */
export const ERROR_HTTP_STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  USERNAME_TAKEN: 409,
  INVALID_USERNAME: 422,
  VALIDATION_ERROR: 400,
  RATE_LIMITED: 429,
  NO_BOOSTER: 409,
  INVALID_THEME: 422,
  NOT_ENOUGH_POINTS: 409,
  ALREADY_CLAIMED: 409,
  WISHLIST_FULL: 409,
  INSUFFICIENT_CHAKRA: 409,
  NOT_OWNER: 409,
  CARD_NOT_FOUND: 404,
  CHARACTER_NOT_FOUND: 404,
  COSMETIC_NOT_FOUND: 404,
  THEME_NOT_FOUND: 404,
  QUEST_NOT_FOUND: 404,
  COSMETIC_NOT_OWNED: 409,
  COSMETIC_SLOT_TAKEN: 409,
  INVALID_COSMETIC_TYPE: 422,
  INTERNAL_ERROR: 500,
};

/** Statut HTTP associé à un code d'erreur métier. */
export function httpStatusForError(code: AppErrorCode): number {
  return ERROR_HTTP_STATUS[code];
}
