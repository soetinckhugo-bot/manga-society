'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { BoosterOpening } from '@/components/booster-opening';
import type { OpenedCardDto, ThemeDto } from '@/types/api';

import { SectionBoundary } from './section-boundary';
import { StateBar } from './state-bar';
import { ThemeGrid } from './theme-grid';
import { ThemePanel } from './theme-panel';
import {
  DailyPackWidget,
  GoldenWidget,
  PityWidget,
  QuestsWidget,
  StreakWidget,
} from './widgets';

/**
 * BoostersPage — orchestrateur client de la page de jeu.
 *
 * Compose les sections, chacune isolée par un SectionBoundary (une section
 * cassée ≠ page blanche). L'écran d'ouverture (BoosterOpening, contrat
 * Agent D) est monté localement à partir des cartes renvoyées par les
 * mutations — aucune logique d'économie côté client.
 */

interface BoostersPageProps {
  themes: ThemeDto[];
}

interface OpeningState {
  cards: OpenedCardDto[];
  isGolden: boolean;
}

export function BoostersPage({ themes }: BoostersPageProps) {
  const t = useTranslations('boosters');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [opening, setOpening] = useState<OpeningState | null>(null);

  const selectedTheme =
    themes.find((theme) => theme.slug === selectedSlug) ?? themes[0] ?? null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('header.title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('header.subtitle')}</p>
      </header>

      <SectionBoundary>
        <StateBar />
      </SectionBoundary>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <SectionBoundary>
          <ThemeGrid
            themes={themes}
            selectedSlug={selectedTheme?.slug ?? null}
            onSelect={setSelectedSlug}
          />
        </SectionBoundary>
        <SectionBoundary>
          <ThemePanel
            theme={selectedTheme}
            onOpened={(cards, isGolden) => setOpening({ cards, isGolden })}
          />
        </SectionBoundary>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SectionBoundary>
          <PityWidget />
        </SectionBoundary>
        <SectionBoundary>
          <GoldenWidget />
        </SectionBoundary>
        <SectionBoundary>
          <DailyPackWidget
            onOpened={(cards, isGolden) => setOpening({ cards, isGolden })}
          />
        </SectionBoundary>
        <SectionBoundary>
          <StreakWidget />
        </SectionBoundary>
      </div>

      <SectionBoundary>
        <QuestsWidget />
      </SectionBoundary>

      {opening ? (
        <BoosterOpening
          cards={opening.cards}
          isGolden={opening.isGolden}
          onComplete={() => setOpening(null)}
        />
      ) : null}
    </div>
  );
}
