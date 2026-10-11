/**
 * Schémas Zod du domaine cartes — partagés client/serveur.
 * Les routes `POST /api/cards/:id/...` portent aussi card_id dans le path :
 * le handler valide le paramètre de route, ce schéma porte la source de
 * vérité du corps (les deux doivent concorder, vérifié côté handler).
 */
import { z } from 'zod';

/** Burn d'une carte doublon contre du chakra (économie → idempotence). */
export const burnCardSchema = z.object({
  card_id: z.uuid(),
  idempotency_key: z.uuid(),
});

/** Application d'un cosmétique possédé sur une carte possédée. */
export const applyCosmeticSchema = z.object({
  card_id: z.uuid(),
  cosmetic_id: z.uuid(),
  idempotency_key: z.uuid(),
});

/** Reroll : brûle le cosmétique du slot et en crédite un autre du même type. */
export const rerollCosmeticSchema = z.object({
  card_id: z.uuid(),
  slot: z.enum(['frame', 'holo', 'dye']),
  idempotency_key: z.uuid(),
});

export type BurnInput = z.infer<typeof burnCardSchema>;
export type ApplyCosmeticInput = z.infer<typeof applyCosmeticSchema>;
export type RerollCosmeticInput = z.infer<typeof rerollCosmeticSchema>;
