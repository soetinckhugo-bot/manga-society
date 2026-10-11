/**
 * Schémas Zod du domaine shop (cosmétiques) — partagés client/serveur.
 * L'achat dépense du chakra : mutation d'économie → idempotence obligatoire.
 */
import { z } from 'zod';

/** Achat d'un cosmétique en chakra. */
export const buyCosmeticSchema = z.object({
  cosmetic_id: z.uuid(),
  idempotency_key: z.uuid(),
});

export type BuyCosmeticInput = z.infer<typeof buyCosmeticSchema>;
