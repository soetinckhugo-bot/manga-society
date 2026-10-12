'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { useReducedMotion } from '@/components/effects';
import type { OpenedCardDto } from '@/types/api';

import { Recap } from './recap';
import { RevealDeck, type RevealDeckHandle } from './reveal-deck';
import { releaseSounds } from './sounds';
import { TearScreen } from './tear-screen';

/**
 * components/booster-opening — SÉQUENCE D'OUVERTURE COMPLÈTE (Agent D).
 *
 * Contrat B↔D : `{ cards: OpenedCardDto[]; isGolden: boolean; onComplete: () => void }`
 * — AUCUN fetch ici, les données arrivent en props (SPEC §5.1 étape 21).
 * Props ADDITIVES optionnelles (non requises par le contrat) :
 *   `packSlug` / `packName` → pack art + titre de l'écran pack
 * (fallback : pack générique 'mix' ; à câbler côté B, cf. HANDOFF).
 *
 * Phases : pack (déchirure) → reveal (flip carte par carte) → récap.
 * Clavier : Espace/Entrée = carte suivante (maintenir = avance rapide),
 * Échap = skip vers le récap (ou fermeture hors reveal). prefers-reduced-
 * motion : reveals instantanés sobres, pas de particules. Zéro fetch.
 */

export interface BoosterOpeningProps {
  cards: OpenedCardDto[];
  isGolden: boolean;
  onComplete: () => void;
  /** ADDITIF optionnel : art du pack (slug thème) — défaut 'mix'. */
  packSlug?: string;
  /** ADDITIF optionnel : nom affiché du pack. */
  packName?: string;
}

type Phase = 'pack' | 'reveal' | 'recap';

const PACK_SLUGS = new Set([
  'shonen',
  'shojo',
  'webtoon',
  'big3',
  'seinen',
  'isekai',
  'mix',
]);

export function BoosterOpening({
  cards,
  isGolden,
  onComplete,
  packSlug = 'mix',
  packName,
}: BoosterOpeningProps) {
  const t = useTranslations('opening');
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('pack');
  const containerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<RevealDeckHandle>(null);
  const phaseRef = useRef<Phase>('pack');

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const safeSlug = PACK_SLUGS.has(packSlug) ? packSlug : 'mix';
  const resolvedPackName = packName ?? t(`themes.${safeSlug}`);

  // Verrouillage du scroll d'arrière-plan + focus initial + préchargement
  // du verso carte dès l'écran pack (PROMPT D).
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    containerRef.current?.focus();

    if (typeof window !== 'undefined') {
      const img = new window.Image();
      img.src = '/card-back.png';
    }

    return () => {
      document.body.style.overflow = previous;
      releaseSounds();
    };
  }, []);

  const goRecap = useCallback(() => setPhase('recap'), []);

  // Clavier global : Espace/Entrée = action du deck, Échap = skip/fermer.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (phaseRef.current === 'reveal') setPhase('recap');
        else onComplete();
        return;
      }
      if (
        phaseRef.current === 'reveal' &&
        (event.key === ' ' || event.key === 'Enter')
      ) {
        // Espace/Entrée (maintenir = key-repeat = avance rapide).
        event.preventDefault();
        deckRef.current?.action();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onComplete]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('aria.label')}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#050508]/97 p-4 backdrop-blur-md outline-none sm:p-6"
    >
      {/* En-tête : titre + fermeture */}
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between py-2">
        <h2
          className={
            isGolden
              ? 'text-sm font-bold tracking-wide text-[color:var(--print-gold)]'
              : 'text-sm font-semibold tracking-wide text-zinc-400'
          }
        >
          {isGolden ? t('pack.goldenTitle') : resolvedPackName}
        </h2>
        <button
          type="button"
          onClick={onComplete}
          aria-label={t('aria.close')}
          className="rounded-full border border-border px-3.5 py-1 text-xs text-zinc-400 transition-colors hover:text-foreground"
        >
          {t('aria.close')} · Esc
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center py-4">
        {phase === 'pack' ? (
          <TearScreen
            packSrc={`/packs/${safeSlug}.png`}
            packName={resolvedPackName}
            isGolden={isGolden}
            reduced={reduced}
            onTorn={() => setPhase('reveal')}
          />
        ) : phase === 'reveal' ? (
          <RevealDeck
            ref={deckRef}
            cards={cards}
            onAllRevealed={goRecap}
            reduced={reduced}
          />
        ) : (
          <Recap
            cards={cards}
            isGolden={isGolden}
            onOpenAnother={onComplete}
            onClose={onComplete}
          />
        )}
      </div>

      {/* Aide clavier (desktop) */}
      <p className="mx-auto w-full max-w-3xl pb-2 text-center text-[11px] text-zinc-600">
        {t('keyboard.hint')}
      </p>
    </div>
  );
}
