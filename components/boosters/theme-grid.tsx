'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';

import type { ThemeDto } from '@/types/api';
import { cn } from '@/lib/utils';

/**
 * Grille mobile-first des thèmes de booster. Carte cliquable : visuel du
 * pack (pack_art_url) ou placeholder pur CSS à l'initiale du thème ;
 * l'état sélectionné est exposé via aria-pressed + bordure or.
 */

interface ThemeGridProps {
  themes: ThemeDto[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}

export function ThemeGrid({ themes, selectedSlug, onSelect }: ThemeGridProps) {
  const t = useTranslations('boosters');
  const locale = useLocale();

  return (
    <section aria-label={t('themes.title')} className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">
        {t('themes.title')}
      </h2>
      {themes.length === 0 ? (
        <p className="rounded-xl border border-border bg-card/60 p-6 text-sm text-muted-foreground">
          {t('themes.empty')}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
          {themes.map((theme) => {
            const name = locale === 'fr' ? theme.name_fr : theme.name_en;
            const selected = theme.slug === selectedSlug;
            return (
              <li key={theme.slug}>
                <button
                  type="button"
                  onClick={() => onSelect(theme.slug)}
                  aria-pressed={selected}
                  className={cn(
                    'flex w-full flex-col overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected
                      ? 'border-primary bg-card shadow-[0_0_0_1px_var(--primary)]'
                      : 'border-border bg-card/40 hover:border-muted-foreground/40 hover:bg-card/70',
                  )}
                >
                  <span className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                    {theme.pack_art_url ? (
                      <Image
                        src={theme.pack_art_url}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 180px"
                        className="object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(212,169,78,0.12),transparent_70%)]"
                      >
                        <span className="text-3xl font-bold text-primary/70">
                          {name.charAt(0).toUpperCase()}
                        </span>
                      </span>
                    )}
                  </span>
                  <span className="px-3 py-2 text-sm font-medium text-foreground">
                    {name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
