import type { CosmeticDto, CosmeticType } from '@/types/api';
import type { Database } from '@/types/database';

/**
 * cosmetic-dto.ts — Mapping défensif des lignes Supabase `cosmetics`
 * (lecture publique directe côté client) vers le contrat CosmeticDto.
 * Les lectures Supabase retournent des `string` / `Json` larges : on
 * réaffûte ici, jamais de `as` direct dans les composants.
 */

type CosmeticRow = Database['public']['Tables']['cosmetics']['Row'];

export function isCosmeticType(value: string): value is CosmeticType {
  return value === 'frame' || value === 'holo' || value === 'dye';
}

/** Mappe une ligne `cosmetics` en CosmeticDto ; null si type invalide. */
export function cosmeticFromRow(row: CosmeticRow): CosmeticDto | null {
  if (!isCosmeticType(row.type)) return null;
  const config = row.css_config;
  const cssConfig =
    config !== null && typeof config === 'object' && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    type: row.type,
    name_fr: row.name_fr,
    name_en: row.name_en,
    chakra_price: row.chakra_price,
    is_ultra_rare: row.is_ultra_rare,
    css_config: cssConfig,
  };
}

/** Nom d'affichage d'un cosmétique selon la locale courante. */
export function cosmeticName(cosmetic: CosmeticDto, locale: string): string {
  return locale === 'fr' ? cosmetic.name_fr : cosmetic.name_en;
}
