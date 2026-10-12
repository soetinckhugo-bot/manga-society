'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CosmeticDto } from '@/types/api';
import { cn } from '@/lib/utils';

interface CosmeticTileProps {
  cosmetic: CosmeticDto;
  locale: string;
  owned: boolean;
  buying: boolean;
  previewing: boolean;
  onPreview: () => void;
  onBuy: () => void;
}

/** Tuile d'un cosmétique du catalogue : nom, prix chakra, badges, actions. */
export function CosmeticTile({
  cosmetic,
  locale,
  owned,
  buying,
  previewing,
  onPreview,
  onBuy,
}: CosmeticTileProps) {
  const t = useTranslations('shop');
  const name = locale === 'fr' ? cosmetic.name_fr : cosmetic.name_en;
  const config = cosmetic.css_config;
  const swatch =
    typeof config['color'] === 'string'
      ? config['color']
      : typeof config['tint'] === 'string'
        ? config['tint']
        : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {swatch ? (
            <span
              aria-hidden
              className="size-5 rounded-full border border-border"
              style={{ backgroundColor: swatch }}
            />
          ) : null}
          <p className="text-sm font-semibold text-foreground">{name}</p>
        </div>
        {cosmetic.is_ultra_rare ? (
          <Badge variant="default">{t('ultraRare')}</Badge>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        {t('price', { count: cosmetic.chakra_price })}
      </p>

      <div className="mt-auto flex items-center gap-2">
        <Button
          variant={previewing ? 'secondary' : 'outline'}
          size="sm"
          onClick={onPreview}
        >
          {t('actions.preview')}
        </Button>
        {owned ? (
          <Badge variant="success" className={cn('ml-auto')}>
            {t('owned')}
          </Badge>
        ) : (
          <Button
            size="sm"
            className="ml-auto"
            disabled={buying}
            onClick={onBuy}
          >
            {t('actions.buy')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Vignette de carte cliquable pour le sélecteur d'aperçu. */
export function PreviewCardThumb({
  imageUrl,
  name,
  selected,
  onSelect,
}: {
  imageUrl: string;
  name: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={name}
      onClick={onSelect}
      className={cn(
        'relative aspect-[5/7] w-14 overflow-hidden rounded-md border transition-colors',
        selected
          ? 'border-[color:var(--primary)] ring-1 ring-[color:var(--primary)]'
          : 'border-border opacity-70 hover:opacity-100',
      )}
    >
      <Image
        src={imageUrl}
        alt={name}
        fill
        sizes="56px"
        className="object-cover object-top"
      />
    </button>
  );
}
