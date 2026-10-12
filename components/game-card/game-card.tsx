'use client';

import { useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { printVisualTier, type Rarity } from '@/lib/config';
import { cn } from '@/lib/utils';
import type { CardDto, CosmeticDto } from '@/types/api';

/**
 * PLACEHOLDER AGENT B — l'Agent D remplace par le rendu carte définitif.
 * Ne pas étendre.
 *
 * Contrat B↔D (props STABLES) : `{ card: CardDto, variant?: 'grid' | 'detail'
 * | 'showcase' }`. Tout rendu carte de l'app passe par ce composant.
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

/** Cadre de base par rareté (codes TCG, tokens --rarity-* de globals.css). */
const RARITY_FRAME: Record<Rarity, string> = {
  common: 'border-zinc-500/60',
  uncommon: 'border-emerald-400/70',
  rare: 'border-blue-400/70',
  epic: 'border-violet-400/70',
  legendary: 'border-[color:var(--rarity-legendary)]',
  mythic: 'border-red-500/80',
};

const PRINT_TIER_CLASSES = {
  first: 'bg-[color:var(--print-first)] text-black',
  gold: 'bg-[color:var(--print-gold)] text-black',
  silver: 'bg-[color:var(--print-silver)] text-black',
  standard: 'bg-zinc-700/90 text-zinc-100',
} as const;

/** Lecture DÉFENSIVE du css_config jsonb d'un cosmétique (clés optionnelles). */
function cosmeticStyle(
  cosmetic: CosmeticDto | null,
  kind: 'frame' | 'holo' | 'dye',
): CSSProperties | undefined {
  if (!cosmetic) return undefined;
  const config = cosmetic.css_config;
  if (!config || typeof config !== 'object') return undefined;

  switch (kind) {
    case 'frame': {
      const color = config['color'];
      if (typeof color !== 'string') return undefined;
      return { borderColor: color, boxShadow: `0 0 12px ${color}55` };
    }
    case 'holo': {
      const tint = typeof config['tint'] === 'string' ? config['tint'] : '#ffffff';
      return { background: `linear-gradient(135deg, ${tint}14, transparent 45%, ${tint}0a)` };
    }
    case 'dye': {
      const color = config['color'];
      if (typeof color !== 'string') return undefined;
      return { backgroundColor: `${color}26`, mixBlendMode: 'screen' };
    }
  }
}

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
    // Fallback image cassée : silhouette avec initiale du nom.
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
  const printTier = printVisualTier(card.print_number);
  const frameStyle = cosmeticStyle(card.frame, 'frame');
  const holoStyle = cosmeticStyle(card.holo, 'holo');
  const dyeStyle = cosmeticStyle(card.dye, 'dye');

  return (
    <article
      data-slot="game-card"
      className={cn(
        'relative flex aspect-[5/7] w-full flex-col overflow-hidden rounded-xl border-2 bg-card',
        RARITY_FRAME[character.base_rarity],
        variant === 'detail' && 'max-w-md',
      )}
      style={frameStyle}
    >
      {/* Illustration du personnage */}
      <div className="relative flex-1 overflow-hidden">
        <CardImage
          imageUrl={character.image_url}
          name={character.name_romaji}
          priority={variant === 'detail'}
          sizes={SIZES_BY_VARIANT[variant]}
        />
        {/* Overlays cosmétiques (pilotés par css_config, défensif). */}
        {holoStyle ? <div aria-hidden className="absolute inset-0" style={holoStyle} /> : null}
        {dyeStyle ? <div aria-hidden className="absolute inset-0" style={dyeStyle} /> : null}
      </div>

      {/* Bandeau infos */}
      <div className="relative flex flex-col gap-0.5 bg-black/60 p-2 backdrop-blur-sm">
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
  );
}
