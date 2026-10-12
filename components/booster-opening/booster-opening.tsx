'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

import { GameCard } from '@/components/game-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Link } from '@/lib/i18n/navigation';
import type { OpenedCardDto } from '@/types/api';

/**
 * PLACEHOLDER AGENT B — contrat B↔D. L'Agent D livre la séquence complète
 * (tear-screen, reveal-deck, flip, recap). NE PAS changer les props.
 *
 * Contrat : `{ cards: OpenedCardDto[]; isGolden: boolean; onComplete: () => void }`.
 * AUCUN fetch ici — les données arrivent en props (SPEC §5.1 étape 21).
 *
 * Comportement placeholder : overlay listant les 5 cartes + actions.
 * Respecte prefers-reduced-motion (aucune animation dans le placeholder).
 */

export interface BoosterOpeningProps {
  cards: OpenedCardDto[];
  isGolden: boolean;
  onComplete: () => void;
}

export function BoosterOpening({
  cards,
  isGolden,
  onComplete,
}: BoosterOpeningProps) {
  const t = useTranslations('game.boosterOpening');
  const tCard = useTranslations('game.card');
  const tCommon = useTranslations('common');
  const primaryButtonRef = useRef<HTMLButtonElement>(null);

  // Focus initial sur l'action principale.
  useEffect(() => {
    primaryButtonRef.current?.focus();
  }, []);

  // Entrée = même action qu'Échap (Radix gère déjà Échap via Dialog).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        onComplete();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onComplete]);

  return (
    <Dialog open onOpenChange={(open) => !open && onComplete()}>
      <DialogContent
        closeLabel={tCommon('close')}
        className="top-0 left-0 max-h-dvh w-full max-w-none -translate-x-0 -translate-y-0 overflow-y-auto border-0 bg-black/95 p-4 backdrop-blur-md sm:top-1/2 sm:left-1/2 sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border sm:border-border sm:bg-popover"
      >
        <DialogHeader className="items-center">
          <DialogTitle className={isGolden ? 'text-[color:var(--print-gold)]' : undefined}>
            {isGolden ? t('goldenTitle') : t('title')}
          </DialogTitle>
        </DialogHeader>

        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {cards.map((card) => (
            <li key={card.id} className="flex flex-col gap-1">
              <GameCard card={card} variant="grid" />
              {card.is_new_character ? (
                <Badge variant="success" className="self-center">
                  {tCard('newCharacter')}
                </Badge>
              ) : null}
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button ref={primaryButtonRef} onClick={onComplete}>
            {t('openAnother')}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/collection">{t('seeCollection')}</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
