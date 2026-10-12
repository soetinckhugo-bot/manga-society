'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { GameCard } from '@/components/game-card';
import { RARITIES, type Rarity } from '@/lib/config';
import { Link } from '@/lib/i18n/navigation';
import type { OpenedCardDto } from '@/types/api';

import { renderPullImage } from './share-image';

import { cn } from '@/lib/utils';

import styles from './opening.module.css';

/**
 * components/booster-opening/recap — éventail des cartes tirées.
 *
 * "Meilleure carte" (rareté max, égalité → plus bas print) mise en avant,
 * boutons Ouvrir un autre / Voir la collection / Copier le lien / Image
 * (PNG partageable 1200×630, canvas maison). Séquence rejouable : le
 * parent remonte un nouvel état d'ouverture.
 */

const RARITY_RANK: Record<Rarity, number> = Object.fromEntries(
  RARITIES.map((rarity, i) => [rarity, i]),
) as Record<Rarity, number>;

/** Index de la meilleure carte : rareté max, égalité → plus bas print. */
export function bestCardIndex(cards: OpenedCardDto[]): number {
  let best = 0;
  for (let i = 1; i < cards.length; i++) {
    const card = cards[i];
    const current = cards[best];
    if (!card || !current) continue;
    const diff =
      RARITY_RANK[card.character.base_rarity] -
      RARITY_RANK[current.character.base_rarity];
    if (diff > 0 || (diff === 0 && card.print_number < current.print_number)) {
      best = i;
    }
  }
  return best;
}

/** Rotation/élévation de l'éventail par position relative au centre. */
function fanTransform(offset: number, isBest: boolean): string {
  const rotate = offset * 8;
  const translateY = Math.abs(offset) * 14;
  if (isBest) return 'translateY(-10px) scale(1.06)';
  return `rotate(${rotate}deg) translateY(${translateY}px)`;
}

export interface RecapProps {
  cards: OpenedCardDto[];
  isGolden: boolean;
  onOpenAnother: () => void;
  onClose: () => void;
}

export function Recap({ cards, isGolden, onOpenAnother, onClose }: RecapProps) {
  const t = useTranslations('opening');
  const tCard = useTranslations('game.card');
  const [imagePending, setImagePending] = useState(false);

  const best = bestCardIndex(cards);
  const bestCard = cards[best];
  const middle = (cards.length - 1) / 2;

  async function handleShareImage() {
    setImagePending(true);
    try {
      const blob = await renderPullImage(cards, best, {
        best: t('recap.bestCard'),
        newBadge: tCard('newCharacter'),
      });
      if (!blob) {
        toast.error(t('recap.imageError'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'manga-society-pull.png';
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setImagePending(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t('recap.copied'));
    } catch {
      toast.error(t('recap.copyError'));
    }
  }

  return (
    <div className={cn(styles.fanEnter, 'flex w-full flex-col items-center gap-6')}>
      {isGolden ? (
        <p className="text-sm font-semibold text-[color:var(--print-gold)]">
          {t('recap.golden')}
        </p>
      ) : null}

      {/* Éventail */}
      <div className="flex w-full items-center justify-center">
        <ol className="flex items-center justify-center">
          {cards.map((card, i) => {
            const offset = i - middle;
            const isBest = i === best;
            return (
              <li
                key={card.id}
                className="w-[17vw] max-w-[130px] shrink-0 transition-transform duration-300 sm:w-32 sm:max-w-none"
                style={{
                  transform: fanTransform(offset, isBest),
                  zIndex: isBest ? 10 : 5 - Math.abs(Math.round(offset)),
                  marginLeft: i === 0 ? 0 : '-6vw',
                  marginRight: 0,
                }}
              >
                <div
                  className="relative"
                  style={
                    isBest && bestCard
                      ? { ['--rarity-best' as string]: `var(--rarity-${bestCard.character.base_rarity})` }
                      : undefined
                  }
                >
                  {isBest ? <div aria-hidden className={styles.bestGlow} /> : null}
                  <GameCard card={card} variant="showcase" />
                </div>
                {isBest ? (
                  <p className="mt-2 -ml-2 text-center text-[11px] font-bold tracking-wide text-[color:var(--print-gold)]">
                    {t('recap.bestCard')}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={onOpenAnother}
          className="rounded-full bg-[color:var(--primary)] px-5 py-2 text-sm font-bold text-[color:var(--primary-foreground)] shadow-lg transition-transform active:scale-95"
        >
          {t('recap.openAnother')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground transition-transform active:scale-95"
        >
          {t('recap.changeBooster')}
        </button>
        <Link
          href="/collection"
          onClick={onClose}
          className="rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground transition-transform active:scale-95"
        >
          {t('recap.seeCollection')}
        </Link>
        <button
          type="button"
          onClick={() => void handleCopyLink()}
          className="rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground transition-transform active:scale-95"
        >
          {t('recap.copyLink')}
        </button>
        <button
          type="button"
          onClick={() => void handleShareImage()}
          disabled={imagePending}
          className="rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground transition-transform active:scale-95 disabled:opacity-50"
        >
          {imagePending ? t('recap.imagePending') : t('recap.image')}
        </button>
      </div>
    </div>
  );
}
