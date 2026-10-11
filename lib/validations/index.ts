/**
 * lib/validations/index.ts — baril des schémas Zod partagés client/serveur.
 * Les routes API ET les formulaires importent depuis '@/lib/validations'.
 */
export {
  openBoosterSchema,
  openPremiumBoosterSchema,
  claimDailyPackSchema,
  type OpenBoosterInput,
  type OpenPremiumBoosterInput,
  type ClaimDailyPackInput,
} from './boosters';

export {
  burnCardSchema,
  applyCosmeticSchema,
  rerollCosmeticSchema,
  type BurnInput,
  type ApplyCosmeticInput,
  type RerollCosmeticInput,
} from './cards';

export { buyCosmeticSchema, type BuyCosmeticInput } from './shop';

export { claimQuestsSchema, type ClaimQuestsInput } from './quests';

export { wishlistToggleSchema, type WishlistToggleInput } from './wishlist';
