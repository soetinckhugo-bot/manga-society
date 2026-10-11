/**
 * Schémas Zod du domaine boosters — partagés client/serveur.
 * Le client valide avant d'envoyer, le serveur re-valide dans le route
 * handler : MÊME schéma des deux côtés (standard commun n°2).
 *
 * Idempotence : toute mutation d'économie accepte `idempotency_key` (uuid v4
 * généré par le client À CHAQUE tentative de clic). La RPC insère la clé
 * ON CONFLICT DO NOTHING et retourne le résultat stocké (standard n°4).
 */
import { z } from 'zod';

/** Ouverture d'un booster gratuit : le joueur choisit son thème. */
export const openBoosterSchema = z.object({
  theme_slug: z.string().min(1).max(64),
  idempotency_key: z.uuid(),
});

/** Booster premium : thème implicite (roll L/M serveur), dépense de points. */
export const openPremiumBoosterSchema = z.object({
  idempotency_key: z.uuid(),
});

/**
 * Pack du jour : le thème est rotatif déterministe côté serveur (sort_order),
 * le client ne choisit rien → pas de champ thème.
 */
export const claimDailyPackSchema = z.object({
  idempotency_key: z.uuid(),
});

export type OpenBoosterInput = z.infer<typeof openBoosterSchema>;
export type OpenPremiumBoosterInput = z.infer<typeof openPremiumBoosterSchema>;
export type ClaimDailyPackInput = z.infer<typeof claimDailyPackSchema>;
