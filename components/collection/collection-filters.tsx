'use client';

import { useLocale, useTranslations } from 'next-intl';

import { RARITY_CODE, RARITIES, type Rarity } from '@/lib/config';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import type { CollectionQueryParams, ThemeDto } from '@/types/api';

/** Valeur des filtres de la grille (sérialisable, incluse dans la queryKey). */
export interface CollectionFiltersValue {
  theme: string;
  rarity: Rarity | null;
  search: string;
  sort: NonNullable<CollectionQueryParams['sort']>;
}

/** Pastille de rareté active : fond coloré (inline style, tokens --rarity-*). */
const RARITY_ACTIVE_BG: Record<Rarity, string> = {
  common: 'color-mix(in srgb, var(--rarity-common) 80%, black)',
  uncommon: 'color-mix(in srgb, var(--rarity-uncommon) 80%, black)',
  rare: 'color-mix(in srgb, var(--rarity-rare) 80%, black)',
  epic: 'color-mix(in srgb, var(--rarity-epic) 80%, black)',
  legendary: 'color-mix(in srgb, var(--rarity-legendary) 85%, black)',
  mythic: 'color-mix(in srgb, var(--rarity-mythic) 80%, black)',
};

const SORT_OPTIONS = ['recent', 'rarity', 'print_number', 'name'] as const;

const SELECT_CLASSNAME =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface CollectionFiltersProps {
  themes: ThemeDto[];
  value: CollectionFiltersValue;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onChange: (value: CollectionFiltersValue) => void;
}

export function CollectionFilters({
  themes,
  value,
  searchInput,
  onSearchInputChange,
  onChange,
}: CollectionFiltersProps) {
  const t = useTranslations('collection');
  const locale = useLocale();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Recherche texte (le debounce 300 ms est appliqué côté parent) */}
        <div className="sm:w-64">
          <Input
            type="search"
            aria-label={t('filters.searchLabel')}
            placeholder={t('filters.searchPlaceholder')}
            value={searchInput}
            onChange={(event) => onSearchInputChange(event.target.value)}
          />
        </div>

        {/* Thème (lecture publique serveur, passée en props) */}
        <select
          aria-label={t('filters.allThemes')}
          className={SELECT_CLASSNAME}
          value={value.theme}
          onChange={(event) => onChange({ ...value, theme: event.target.value })}
        >
          <option value="">{t('filters.allThemes')}</option>
          {themes.map((theme) => (
            <option key={theme.slug} value={theme.slug}>
              {locale === 'fr' ? theme.name_fr : theme.name_en}
            </option>
          ))}
        </select>

        {/* Tri (exécuté côté SQL, jamais de tri client) */}
        <select
          aria-label={t('filters.sortLabel')}
          className={cn(SELECT_CLASSNAME, 'sm:ml-auto')}
          value={value.sort}
          onChange={(event) =>
            onChange({
              ...value,
              sort: event.target.value as CollectionFiltersValue['sort'],
            })
          }
        >
          {SORT_OPTIONS.map((sort) => (
            <option key={sort} value={sort}>
              {t(`filters.sort.${sort}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Pills de rareté (codes TCG, tokens --rarity-*) : sélection unique,
          reclic pour désactiver. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('filters.sort.rarity')}>
        {RARITIES.map((rarity) => {
          const active = value.rarity === rarity;
          return (
            <button
              key={rarity}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onChange({ ...value, rarity: active ? null : rarity })
              }
              style={active ? { backgroundColor: RARITY_ACTIVE_BG[rarity] } : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                active
                  ? 'border-transparent text-zinc-950'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: `var(--rarity-${rarity})` }}
              />
              {RARITY_CODE[rarity]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
