'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { ParticleBurst } from './particles';
import { playSound, unlockSounds } from './sounds';

import styles from './opening.module.css';

/**
 * components/booster-opening/tear-screen — écran pack + déchirure.
 *
 * Pointer-drag le long du bord supérieur : le rabat suit le doigt
 * (mutations DOM sous rAF, zéro re-render), à ~80 % du bord la déchirure
 * se déclenche : son tear, confettis dorés (canvas maison), halo qui
 * s'échappe, rabat envoyé valser (WAAPI, transform/opacity).
 *
 - Fallback accessible : bouton "Ouvrir" (clic/Entrée) + reduced-motion.
 * isGolden : halo doré + son coin au montage.
 */

export interface TearScreenProps {
  packSrc: string;
  packName: string;
  isGolden: boolean;
  reduced: boolean;
  onTorn: () => void;
}

const TEAR_THRESHOLD = 0.8;
const FLAP_RATIO = 0.15;

export function TearScreen({ packSrc, packName, isGolden, reduced, onTorn }: TearScreenProps) {
  const t = useTranslations('opening');
  const [torn, setTorn] = useState(false);
  const [dragging, setDragging] = useState(false);

  const packRef = useRef<HTMLDivElement>(null);
  const flapRef = useRef<HTMLDivElement>(null);
  const gapRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const burstRef = useRef<ParticleBurst | null>(null);
  const progressRef = useRef(0);
  const rafRef = useRef(0);
  const tornRef = useRef(false);
  const pointerStartX = useRef(0);

  // Booster doré : fanfare pièce dès l'écran pack.
  useEffect(() => {
    if (isGolden) {
      unlockSounds();
      playSound('coin');
    }
  }, [isGolden]);

  /** Met à jour le rabat/gap/liseré en mutations DOM directes (rAF). */
  const applyProgress = useCallback((p: number) => {
    const flap = flapRef.current;
    if (!flap) return;
    const deg = p * 26;
    const lift = p * 46;
    flap.style.transform = `translateY(${-lift}% ) rotate(${-deg * 0.35}deg)`;
    flap.style.opacity = String(1 - p * 0.25);
    const gap = gapRef.current;
    if (gap) gap.style.opacity = String(Math.min(1, p * 1.4));
    const guide = guideRef.current;
    if (guide) {
      guide.style.opacity = p > 0.02 ? '1' : '0';
      guide.style.transform = `translateX(${p * 100}%)`;
    }
  }, []);

  const resetFlap = useCallback(() => {
    const flap = flapRef.current;
    if (!flap || tornRef.current) return;
    flap.animate(
      [
        { transform: flap.style.transform || 'translateY(0%) rotate(0deg)', opacity: 1 },
        { transform: 'translateY(0%) rotate(0deg)', opacity: 1 },
      ],
      { duration: 320, easing: 'cubic-bezier(0.25, 1.4, 0.4, 1)' },
    ).onfinish = () => {
      if (!tornRef.current) applyProgress(0);
    };
    const gap = gapRef.current;
    if (gap) gap.style.opacity = '0';
    progressRef.current = 0;
  }, [applyProgress]);

  const complete = useCallback(() => {
    if (tornRef.current) return;
    tornRef.current = true;
    setTorn(true);
    unlockSounds();
    playSound('tear');

    // Rabat envoyé valser.
    const flap = flapRef.current;
    if (flap && !reduced) {
      flap.animate(
        [
          { transform: flap.style.transform, opacity: 0.85 },
          { transform: 'translateY(-180%) rotate(-24deg)', opacity: 0 },
        ],
        { duration: 520, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
      ).onfinish = () => {
        flap.style.opacity = '0';
      };
    } else if (flap) {
      flap.style.opacity = '0';
    }

    // Confettis dorés + halo qui s'échappe.
    const canvas = canvasRef.current;
    if (canvas && !reduced) {
      burstRef.current ??= new ParticleBurst(canvas);
      burstRef.current.resize();
      burstRef.current.burst({
        count: isGolden ? 140 : 90,
        colors: isGolden
          ? ['#f5d67b', '#d4a94e', '#fff6d8', '#ffffff']
          : ['#d4a94e', '#f5d67b', '#f4f4f5'],
        originY: 0.3,
        spreadX: 0.5,
        speed: 560,
        sizeMin: 4,
        sizeMax: 10,
        shapes: ['rect', 'shard'],
        life: 1.6,
      });
    }

    window.setTimeout(onTorn, reduced ? 120 : 620);
  }, [isGolden, reduced, onTorn]);

  // Nettoyage au démontage.
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      burstRef.current?.destroy();
    },
    [],
  );

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (tornRef.current) return;
    unlockSounds();
    playSound('click');
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStartX.current = event.clientX;
    event.preventDefault();
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || tornRef.current) return;
    const zone = event.currentTarget.getBoundingClientRect();
    // Le drag est mesuré depuis le point d'appui jusqu'au bord droit,
    // normalisé sur ~60 % de la largeur de la zone.
    const raw = (event.clientX - pointerStartX.current) / (zone.width * 0.6);
    const p = Math.max(0, Math.min(1, raw));
    progressRef.current = p;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => applyProgress(p));
    if (p >= TEAR_THRESHOLD) {
      setDragging(false);
      complete();
    }
  }

  function handlePointerUp() {
    setDragging(false);
    if (tornRef.current) return;
    if (progressRef.current >= TEAR_THRESHOLD) complete();
    else resetFlap();
  }

  return (
    <div className="flex w-full flex-col items-center gap-7">
      <p className="text-sm text-zinc-400">{t('pack.hint')}</p>

      <div className="relative flex items-center justify-center">
        {/* Halo lumineux */}
        <div
          aria-hidden
          className={cn(
            styles.packHalo,
            isGolden && styles.packHaloGolden,
            torn && styles.packHaloTorn,
          )}
        />

        {/* Pack (ratio 3:4) */}
        <div
          ref={packRef}
          className={cn(
            styles.packEnter,
            'relative aspect-[3/4] w-[min(66vw,290px)] overflow-hidden rounded-xl shadow-2xl',
          )}
        >
          <Image
            src={packSrc}
            alt={packName}
            fill
            priority
            sizes="(max-width: 640px) 66vw, 290px"
            className="select-none object-cover"
            draggable={false}
          />

          {/* Entaille sombre révélée sous le rabat */}
          <div
            ref={gapRef}
            aria-hidden
            className="absolute top-0 right-0 left-0 h-[15%] bg-gradient-to-b from-[#050508] via-[#0b0b12] to-transparent opacity-0"
          />

          {/* Rabat supérieur déchirable */}
          <div ref={flapRef} className={styles.flap} style={{ height: `${FLAP_RATIO * 100}%` }}>
            <div className="relative h-full w-full overflow-hidden rounded-t-xl">
              <Image
                src={packSrc}
                alt=""
                fill
                priority
                sizes="(max-width: 640px) 66vw, 290px"
                className="select-none object-cover object-top"
                draggable={false}
              />
            </div>
            <div className={styles.flapEdge} />
          </div>

          {/* Zone de drag le long du haut */}
          {!torn ? (
            <div
              role="button"
              tabIndex={-1}
              aria-label={t('pack.hint')}
              className={styles.dragZone}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <div ref={guideRef} className={cn(styles.dragGuide, 'right-1/2 left-0')} />
            </div>
          ) : null}
        </div>

        {/* Confettis de déchirure */}
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute -inset-x-20 -inset-y-24 z-20 h-[calc(100%+12rem)] w-[calc(100%+10rem)]"
        />
      </div>

      {/* Fallback accessible : bouton Ouvrir */}
      <button
        type="button"
        onClick={() => {
          unlockSounds();
          complete();
        }}
        disabled={torn}
        className="rounded-full bg-[color:var(--primary)] px-8 py-2.5 text-sm font-bold text-[color:var(--primary-foreground)] shadow-lg transition-transform active:scale-95 disabled:opacity-50"
      >
        {t('pack.open')}
      </button>

      <p className="text-xs text-zinc-600">{packName}</p>
    </div>
  );
}
