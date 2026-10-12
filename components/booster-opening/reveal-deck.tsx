'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import type { Rarity } from '@/lib/config';
import type { OpenedCardDto } from '@/types/api';

import { CardReveal, intensityFor } from './card-reveal';
import { ParticleBurst } from './particles';
import { playSound } from './sounds';

import styles from './opening.module.css';

/**
 * components/booster-opening/reveal-deck — les cartes face cachée + la
 * state machine du reveal (PROMPT D) :
 *
 * - 5 verso empilés (offset léger), pastilles de progression, "Tout révéler"
 * - Espace/Entrée = retourner la carte courante ; maintenir = avance rapide
 *   (le key-repeat alimente action()) ; Échap = skip vers le récap
 * - Intensité par rareté (C sobre → M maximal) via card-reveal + particules
 *   canvas (< 300 nœuds) + sons CC0
 * - prefers-reduced-motion : flip quasi instantané, pas de particules,
 *   défilement sobre
 *
 * Expose `action()` (forwardRef) pour le clavier et "Tout révéler".
 */

export interface RevealDeckHandle {
  /** Action unique : flip la carte courante, ou avance si déjà retournée. */
  action: () => void;
  /** Révèle toutes les cartes une par une (cadence rapide). */
  revealAll: () => void;
}

export interface RevealDeckProps {
  cards: OpenedCardDto[];
  onAllRevealed: () => void;
  reduced: boolean;
}

/** Couleurs de confettis par rareté (tokens design system). */
const CONFETTI_COLORS: Record<RevealRarity, string[]> = {
  rare: ['#60a5fa', '#93c5fd', '#f4f4f5'],
  epic: ['#d4a94e', '#f5d67b', '#a78bfa'],
  legendary: ['#d4a94e', '#f5d67b', '#fff6d8'],
  mythic: ['#dc2626', '#f5d67b', '#dc2626', '#f4f4f5'],
};

type RevealRarity = Exclude<Rarity, 'common' | 'uncommon'>;

const DUREE_FLIP_MS = 560;
const DUREE_FLIP_REDUCED_MS = 40;

function dwellMs(rarity: Rarity, reduced: boolean): number {
  if (reduced) return 500;
  switch (rarity) {
    case 'common':
    case 'uncommon':
      return 950;
    default:
      return 1700;
  }
}

export const RevealDeck = forwardRef<RevealDeckHandle, RevealDeckProps>(
  function RevealDeck({ cards, onAllRevealed, reduced }, ref) {
    const t = useTranslations('opening');

    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [fx, setFx] = useState(false);
    const [revealedAll, setRevealedAll] = useState(false);

    const indexRef = useRef(0);
    const flippedRef = useRef(false);
    const fxRef = useRef(false);
    const soundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const revealAllTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const doneRef = useRef(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const burstRef = useRef<ParticleBurst | null>(null);

    const current = cards[index];
    const total = cards.length;
    const remaining = total - index;

    const clearTimers = useCallback(() => {
      if (soundTimerRef.current) clearTimeout(soundTimerRef.current);
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
      if (revealAllTimerRef.current) clearInterval(revealAllTimerRef.current);
      soundTimerRef.current = null;
      dwellTimerRef.current = null;
      revealAllTimerRef.current = null;
    }, []);

    /** FX + son au moment où la face apparaît (mi-flip). */
    const fireFx = useCallback(() => {
      if (fxRef.current || !current) return;
      fxRef.current = true;
      setFx(true);

      const rarity = current.character.base_rarity;
      const intensity = intensityFor(rarity);
      playSound(
        intensity === 'sober' || intensity === 'shine'
          ? 'flip'
          : intensity === 'confetti'
            ? 'rare'
            : intensity === 'gold'
              ? 'epic'
              : intensity === 'flash'
                ? 'legendary'
                : 'mythic',
      );

      // Particules (Rare+), jamais en reduced-motion, canvas < 300 nœuds.
      if (!reduced && intensity !== 'sober' && intensity !== 'shine') {
        const canvas = canvasRef.current;
        if (canvas) {
          burstRef.current ??= new ParticleBurst(canvas);
          burstRef.current.resize();
          const colors =
            CONFETTI_COLORS[rarity as RevealRarity] ??
            CONFETTI_COLORS.rare;
          burstRef.current.burst({
            count: intensity === 'mythic' ? 150 : intensity === 'flash' ? 120 : 80,
            colors,
            originY: 0.42,
            spreadX: 0.5,
            speed: intensity === 'mythic' ? 640 : 520,
            sizeMin: 4,
            sizeMax: intensity === 'mythic' ? 11 : 9,
            life: intensity === 'mythic' ? 2.0 : 1.5,
            shapes: ['rect', 'shard', 'circle'],
          });
          if (intensity === 'mythic') {
            // Particules persistantes pendant que la carte reste affichée.
            burstRef.current.burst({
              count: 60,
              colors,
              originY: 0.6,
              spreadX: 0.7,
              speed: 120,
              gravity: -60,
              sizeMin: 2,
              sizeMax: 5,
              shapes: ['circle'],
              persistent: true,
            });
          }
        }
      }
    }, [current, reduced]);

    const advance = useCallback(() => {
      if (doneRef.current) return;
      clearTimers();
      burstRef.current?.stop();
      if (indexRef.current + 1 >= total) {
        doneRef.current = true;
        setRevealedAll(true);
        onAllRevealed();
        return;
      }
      indexRef.current += 1;
      flippedRef.current = false;
      fxRef.current = false;
      setIndex(indexRef.current);
      setFlipped(false);
      setFx(false);
    }, [total, onAllRevealed, clearTimers]);

    const flip = useCallback(() => {
      if (flippedRef.current || doneRef.current || !current) return;
      flippedRef.current = true;
      setFlipped(true);

      const rarity = current.character.base_rarity;
      const halfFlip = reduced ? DUREE_FLIP_REDUCED_MS : DUREE_FLIP_MS / 2;

      // t = mi-flip : la face apparaît → FX + son de rareté (flip sonore
      // pour C/U via fireFx, sons dédiés Rare+), puis dwell avant la suite.
      soundTimerRef.current = setTimeout(() => {
        fireFx();
        dwellTimerRef.current = setTimeout(advance, dwellMs(rarity, reduced) - halfFlip);
      }, halfFlip);
    }, [current, reduced, fireFx, advance]);

    const action = useCallback(() => {
      if (revealAllTimerRef.current) return; // "Tout révéler" en cours
      if (!flippedRef.current) flip();
      else advance(); // déjà retournée : l'action avance (hold = rapide)
    }, [flip, advance]);

    const revealAll = useCallback(() => {
      if (revealAllTimerRef.current || doneRef.current) return;
      revealAllTimerRef.current = setInterval(() => {
        if (doneRef.current) {
          clearInterval(revealAllTimerRef.current ?? undefined);
          revealAllTimerRef.current = null;
          return;
        }
        action();
      }, 400);
    }, [action]);

    useImperativeHandle(ref, () => ({ action, revealAll }), [action, revealAll]);

    // Nettoyage strict à l'unmount (timers + canvas + particules).
    useEffect(
      () => () => {
        clearTimers();
        burstRef.current?.destroy();
      },
      [clearTimers],
    );

    if (!current) return null;

    return (
      <div className="flex w-full flex-col items-center gap-6">
        {/* Zone carte + particules (canvas superposé, pointer-events none) */}
        <div className="relative flex items-center justify-center">
          <canvas
            ref={canvasRef}
            aria-hidden
            className="pointer-events-none absolute -inset-x-24 -inset-y-16 z-30 h-[calc(100%+8rem)] w-[calc(100%+12rem)]"
          />
          {/* Stack des verso restants (offset léger, derrière la carte courante) */}
          <div aria-hidden className="absolute">
            {Array.from({ length: Math.min(remaining - 1, 4) }, (_, i) => (
              <div
                key={i}
                className={cn(
                  styles.deckCard,
                  'absolute aspect-[5/7] w-[min(70vw,290px)] rounded-xl opacity-70',
                )}
                style={{
                  transform: `translate(${(i + 1) * 7}px, ${-(i + 1) * 7}px) rotate(${(i + 1) * 1.6}deg)`,
                  zIndex: -(i + 1),
                }}
              >
                {/* Petit verso fantôme (décoratif) */}
                <div className="h-full w-full rounded-xl border border-border bg-zinc-900/80" />
              </div>
            ))}
          </div>

          <div className="relative z-10">
            <CardReveal card={current} flipped={flipped} fx={fx} reduced={reduced} />
          </div>
        </div>

        {/* Pastilles de progression */}
        <div
          className="flex items-center gap-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.min(index + (flipped ? 1 : 0), total)}
          aria-label={t('reveal.progress', { current: Math.min(index + 1, total), total })}
        >
          {cards.map((card, i) => (
            <span
              key={card.id}
              className={cn(styles.pill, i < index + (flipped || revealedAll ? 1 : 0) && styles.pillDone)}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={action}
            className="rounded-full bg-[color:var(--primary)] px-5 py-2 text-sm font-semibold text-[color:var(--primary-foreground)] transition-transform active:scale-95"
          >
            {flipped ? t('reveal.next') : t('reveal.flip')}
          </button>
          <button
            type="button"
            onClick={revealAll}
            className="rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground transition-transform active:scale-95"
          >
            {t('reveal.revealAll')}
          </button>
        </div>

        <p className="max-w-xs text-center text-xs text-zinc-500">{t('reveal.hint')}</p>
      </div>
    );
  },
);
