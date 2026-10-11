/**
 * Schémas Zod du domaine quêtes — partagés client/serveur.
 * Le claim crédite du chakra : mutation d'économie → idempotence obligatoire.
 * `quest_ids` borne à 3 = le nombre de quêtes quotidiennes de la config.
 */
import { z } from 'zod';

/** Réclamation des quêtes complétées du jour. */
export const claimQuestsSchema = z.object({
  quest_ids: z.array(z.uuid()).min(1).max(3),
  idempotency_key: z.uuid(),
});

export type ClaimQuestsInput = z.infer<typeof claimQuestsSchema>;
