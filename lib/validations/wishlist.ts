/**
 * Schémas Zod du domaine wishlist — partagés client/serveur.
 *
 * PAS d'idempotency_key ici : le toggle est naturellement idempotent
 * (upsert/delete déterministe sur (user_id, character_id) — répéter la
 * même requête produit le même état, la RPC reste sans effet supplémentaire).
 * Le cap de 10 slots est un conflit métier renvoyé en 'WISHLIST_FULL'.
 */
import { z } from 'zod';

/** Ajout/retrait d'un perso de la wishlist (toggle). */
export const wishlistToggleSchema = z.object({
  character_id: z.uuid(),
});

export type WishlistToggleInput = z.infer<typeof wishlistToggleSchema>;
