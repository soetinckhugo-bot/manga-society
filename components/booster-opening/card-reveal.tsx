'use client';

import { useTranslations } from 'next-intl';

import { CardBack, GameCard } from '@/components/game-card';
import type { Rarity } from '@/lib/config';
import type { OpenedCardDto } from '@/types/api';

import { cn } from '@/lib/utils';

import styles from './opening.module.css';

/**
 * components/booster-opening/card-reveal — présentation d'UNE carte
 * retournée (flip 3D + intensité par rareté). Le state machine du deck
 * vit dans reveal-deck.tsx ; ce composant est présentationnel.
 */

export type RevealIntensity = 'sober' | 'shine' | 'confetti' | 'gold' | 'flash' | 'mythic';

/** Intensité du reveal dérivée de la rareté (PROMPT D : C sobre → M maximal). */
export function intensityFor(rarity: Rarity): RevealIntensity {
  switch (rarity) {
    case 'common':
      return 'sober';
    case 'uncommon':
      return 'shine';
    case 'rare':
      return 'confetti';
    case 'epic':
      return 'gold';
    case 'legendary':
      return 'flash';
    case 'mythic':
      return 'mythic';
  }
}

const TITLE_RARITY: Partial<Record<Rarity, string>> = {
  legendary: 'var(--rarity-legendary)',
  mythic: 'var(--rarity-mythic)',
};

export interface CardRevealProps {
  card: OpenedCardDto;
  /** La carte est-elle retournée (flip 3D joué) ? */
  flipped: boolean;
  /** FX déclenchés (après la moitié du flip). */
  fx: boolean;
  reduced: boolean;
}

export function CardReveal({ card, flipped, fx, reduced }: CardRevealProps) {
  const tRarity = useTranslations('boosters');
  const tCard = useTranslations('game.card');
  const rarity = card.character.base_rarity;
  const intensity = intensityFor(rarity);
  const titleColor = TITLE_RARITY[rarity];

  const showTitle = fx && !reduced && titleColor !== undefined;
  const showRays = fx && !reduced && intensity === 'mythic';
  const showFlash = fx && !reduced && intensity === 'flash';
  const pulse = fx && !reduced && (intensity === 'flash' || intensity === 'mythic');
  const shine = fx && !reduced && (intensity === 'gold' || intensity === 'flash' || intensity === 'mythic');

  return (
    <div className="relative flex flex-col items-center gap-5">
      {/* Titre rareté (Légendaire/Mythique) */}
      {titleColor ? (
        <span
          aria-hidden
          className={cn(styles.rarityTitle, showTitle && styles.rarityTitleOn)}
          style={{ color: titleColor }}
        >
          {tRarity(`rarity.${rarity}`)}
        </span>
      ) : null}

      <div className="relative w-[min(70vw,290px)]">
        {/* Rayons tournants (Mythique) */}
        <div aria-hidden className={cn(styles.rays, showRays && styles.raysOn)} />

        <div className={cn('relative aspect-[5/7] w-full', showRays && 'z-10')}>
          {/* Shake Mythique */}
          <div className={cn('h-full w-full', fx && !reduced && intensity === 'mythic' && styles.shakeOn)}>
            {/* Pulse Légendaire/Mythique */}
            <div className={cn('h-full w-full', pulse && styles.pulseOn)}>
              <div className={cn(styles.flipViewport, 'h-full w-full')}>
                <div className={cn(styles.flipInner, flipped && styles.flipInnerFlipped)}>
                  <div className={cn(styles.flipFace, 'rounded-xl')}>
                    <CardBack priority />
                  </div>
                  <div className={cn(styles.flipFace, styles.flipFront, 'rounded-xl')}>
                    <div className="relative h-full w-full">
                      <GameCard card={card} variant="grid" />
                      {card.is_new_character ? (
                        <span className="absolute -top-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[color:var(--print-gold)] px-2 py-0.5 text-[10px] font-bold tracking-wide text-black shadow-lg">
                          {tCard('newCharacter')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {/* Flash Légendaire */}
              <div aria-hidden className={cn(styles.flash, showFlash && styles.flashOn)} />
              {/* Brillance Épique+ */}
              {shine ? <div aria-hidden className={cn(styles.shineBand, styles.shineOn)} /> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
