'use client';

import { useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { printVisualTier, RARITY_CODE, type Rarity } from '@/lib/config';
import { cn } from '@/lib/utils';

import { Tilt } from '@/components/effects';
import type { CardDto, CosmeticDto } from '@/types/api';

import styles from './game-card.module.css';

/**
 * components/game-card — RENDU CARTE DÉFINITIF (Agent D).
 *
 * Contrat B↔D (props STABLES) : `{ card: CardDto, variant?: 'grid' | 'detail'
 * | 'showcase' }`. Tout rendu carte de l'app passe par ce composant.
 *
 * Ratio TCG 5/7, cadre de base par rareté (6 déclinaisons, tokens
 * --rarity-*), badge print par tier (config), first owner, overlays
 * cosmétiques pilotés par `css_config` jsonb (défensif). Halo animé
 * Légendaire/Mythique et shimmer print en transform/opacity uniquement.
 */

export type GameCardVariant = 'grid' | 'detail' | 'showcase';

export interface GameCardProps {
  card: CardDto;
  variant?: GameCardVariant;
}

const SIZES_BY_VARIANT: Record<GameCardVariant, string> = {
  grid: '(max-width: 640px) 45vw, 200px',
  detail: '(max-width: 640px) 90vw, 420px',
  showcase: '(max-width: 640px) 30vw, 160px',
};

/** Cadre de base par rareté (codes TCG sobre, module CSS + tokens). */
const FRAME_BY_RARITY: Record<Rarity, string> = {
  common: styles.frameCommon,
  uncommon: styles.frameUncommon,
  rare: styles.frameRare,
  epic: styles.frameEpic,
  legendary: styles.frameLegendary,
  mythic: styles.frameMythic,
};

const HALO_BY_RARITY: Partial<Record<Rarity, string>> = {
  legendary: styles.haloLegendary,
  mythic: styles.haloMythic,
};

const GEM_BY_RARITY: Partial<Record<Rarity, string>> = {
  epic: styles.gem,
  legendary: styles.gemLegendary,
  mythic: styles.gemMythic,
};

const PRINT_TIER_CLASSES = {
  first: styles.printFirst,
  gold: styles.printGold,
  silver: styles.printSilver,
  standard: styles.printStandard,
} as const;

/* ---------------------------------------------------------------------------
 * Lecture DÉFENSIVE du css_config jsonb (un cosmétique = des tokens CSS,
 * jamais de code par cosmétique). Clés optionnelles, types vérifiés.
 * ------------------------------------------------------------------------- */

function readConfig(cosmetic: CosmeticDto | null): Record<string, unknown> | null {
  if (!cosmetic) return null;
  const config = cosmetic.css_config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  return config as Record<string, unknown>;
}

function readString(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];
  return typeof value === 'string' ? value : null;
}

function readNumber(config: Record<string, unknown>, key: string): number | null {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Cadre cosmétique : couleur de bordure + halo (prime sur le cadre rareté). */
function cosmeticFrameStyle(cosmetic: CosmeticDto | null): CSSProperties | undefined {
  const config = readConfig(cosmetic);
  if (!config) return undefined;
  const color = readString(config, 'color');
  if (!color) return undefined;
  const glow = readNumber(config, 'glow') ?? 12;
  return {
    borderColor: color,
    boxShadow: `0 0 ${glow}px ${color}59, inset 0 0 ${Math.round(glow / 2)}px ${color}26`,
  };
}

interface HoloStyle {
  /** Teinte statique au repos (linear-gradient peint une fois). */
  resting: CSSProperties;
  /** Bande irisée animée au survol. */
  band: CSSProperties | undefined;
}

function cosmeticHolo(cosmetic: CosmeticDto | null): HoloStyle | undefined {
  const config = readConfig(cosmetic);
  if (!config) return undefined;
  const tint = readString(config, 'tint') ?? '#ffffff';
  const opacity = readNumber(config, 'opacity') ?? 0.35;
  const bandOpacity = readNumber(config, 'band_opacity') ?? 0.5;
  return {
    resting: {
      background: `linear-gradient(135deg, ${tint}14, transparent 45%, ${tint}0d)`,
      opacity,
    },
    band: {
      background: `linear-gradient(90deg, transparent, ${tint}66, transparent)`,
      opacity: bandOpacity,
    },
  };
}

/** Teinte (dye) : blend-mode screen par défaut, opacity configurable. */
function cosmeticDyeStyle(cosmetic: CosmeticDto | null): CSSProperties | undefined {
  const config = readConfig(cosmetic);
  if (!config) return undefined;
  const color = readString(config, 'color');
  if (!color) return undefined;
  const blend = readString(config, 'blend') ?? 'screen';
  const opacity = readNumber(config, 'opacity') ?? 0.5;
  return { backgroundColor: `${color}3d`, mixBlendMode: blend as CSSProperties['mixBlendMode'], opacity };
}

/* ------------------------------------------------------------------------- */

function CardImage({
  imageUrl,
  name,
  priority,
  sizes,
}: {
  imageUrl: string;
  name: string;
  priority: boolean;
  sizes: string;
}) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    // Fallback image cassée : silhouette sombre avec initiale du nom.
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-800">
        <span className="text-4xl font-bold text-zinc-600">
          {name.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <Image
      src={imageUrl}
      alt={name}
      fill
      priority={priority}
      sizes={sizes}
      className="object-cover object-top"
      onError={() => setBroken(true)}
    />
  );
}

export function GameCard({ card, variant = 'grid' }: GameCardProps) {
  const t = useTranslations('game.card');

  const { character } = card;
  const rarity = character.base_rarity;
  const printTier = printVisualTier(card.print_number);
  const frameStyle = cosmeticFrameStyle(card.frame);
  const holo = cosmeticHolo(card.holo);
  const dyeStyle = cosmeticDyeStyle(card.dye);
  const showGems = rarity === 'epic' || rarity === 'legendary' || rarity === 'mythic';
  const gemClass = GEM_BY_RARITY[rarity];

  return (
    <Tilt className="aspect-[5/7] w-full" intensity={8}>
      {/* Halo animé (Légendaire/Mythique) : sibling de la carte pour ne pas
          être rogné par l'overflow-hidden du cadre. */}
      {HALO_BY_RARITY[rarity] ? (
        <div aria-hidden className={cn(styles.halo, HALO_BY_RARITY[rarity])} />
      ) : null}

      <article
        data-slot="game-card"
        className={cn(
          'relative flex h-full w-full flex-col overflow-hidden rounded-xl bg-card',
          styles.frame,
          FRAME_BY_RARITY[rarity],
          variant === 'detail' && 'max-w-md',
        )}
        style={frameStyle}
      >
        {/* Gems d'angle (Épique+). */}
        {showGems && gemClass ? (
          <>
            <span aria-hidden className={cn(gemClass, 'top-1.5 left-1.5 z-10')} />
            <span aria-hidden className={cn(gemClass, 'top-1.5 right-1.5 z-10')} />
            <span aria-hidden className={cn(gemClass, 'bottom-1.5 left-1.5 z-10')} />
            <span aria-hidden className={cn(gemClass, 'right-1.5 bottom-1.5 z-10')} />
          </>
        ) : null}

        {/* Illustration du personnage */}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-t-[10px]">
          <CardImage
            imageUrl={character.image_url}
            name={character.name_romaji}
            priority={variant === 'detail'}
            sizes={SIZES_BY_VARIANT[variant]}
          />

          {/* Scrim bas pour lisibilité du print. */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/70 to-transparent"
          />

          {/* Numéro de print gravé (#print/total). */}
          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-px font-mono text-[10px] font-medium text-zinc-200 backdrop-blur-sm">
            #{String(card.print_number).padStart(4, '0')}/{character.print_count}
          </span>

          {/* Code rareté (badge TCG haut droite). */}
          <span
            className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold backdrop-blur-sm"
            style={{
              borderColor: `color-mix(in srgb, var(--rarity-${rarity}) 70%, transparent)`,
              backgroundColor: `color-mix(in srgb, var(--rarity-${rarity}) 18%, transparent)`,
              color: `var(--rarity-${rarity})`,
            }}
          >
            {RARITY_CODE[rarity]}
          </span>

          {/* Overlays cosmétiques (pilotés par css_config). */}
          {holo ? (
            <div aria-hidden className={styles.holo}>
              <div className="absolute inset-0" style={holo.resting} />
              {holo.band ? <div className={styles.holoBand} style={holo.band} /> : null}
            </div>
          ) : null}
          {dyeStyle ? <div aria-hidden className="absolute inset-0" style={dyeStyle} /> : null}
        </div>

        {/* Bandeau infos */}
        <div className="relative flex flex-col gap-0.5 rounded-b-[10px] bg-black/60 p-2 backdrop-blur-sm">
          <h3 className="truncate text-xs font-semibold text-zinc-100 sm:text-sm">
            {character.name_romaji}
          </h3>
          {character.name_native ? (
            <p className="truncate text-[10px] text-zinc-500">{character.name_native}</p>
          ) : null}
          <p className="truncate text-[10px] text-zinc-400 sm:text-xs">
            {character.anime_title}
          </p>
          <div className="mt-0.5 flex items-center gap-1">
            <span
              className={cn(
                'rounded px-1 py-px font-mono text-[10px] font-bold',
                styles.printBadge,
                PRINT_TIER_CLASSES[printTier],
              )}
            >
              #{card.print_number}
            </span>
            {card.first_owner ? (
              <span className="rounded bg-amber-500/20 px-1 py-px text-[10px] font-medium text-amber-300">
                {t('firstOwner')}
              </span>
            ) : null}
          </div>
        </div>
      </article>
    </Tilt>
  );
}
