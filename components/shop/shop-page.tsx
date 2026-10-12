'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { SectionBoundary } from '@/components/collection/section-boundary';
import { cosmeticFromRow, cosmeticName } from '@/components/cosmetic-dto';
import { GameCard } from '@/components/game-card';
import { CosmeticTile, PreviewCardThumb } from '@/components/shop/cosmetic-tile';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ApiError,
  boosterStateQueryKey,
  buyCosmetic,
  getCollection,
} from '@/lib/query/api';
import { createClient } from '@/lib/supabase/client';
import type { CardDto, CosmeticDto, CosmeticType } from '@/types/api';

const SHOP_TABS = ['frame', 'holo', 'dye'] as const satisfies readonly CosmeticType[];

/** Catalogue : lecture publique directe `cosmetics` (RLS public). */
async function fetchCatalog(): Promise<CosmeticDto[]> {
  const supabase = createClient();
  const { data: rows, error } = await supabase
    .from('cosmetics')
    .select('*')
    .order('chakra_price');
  if (error) throw error;
  return (rows ?? [])
    .map(cosmeticFromRow)
    .filter((cosmetic): cosmetic is CosmeticDto => cosmetic !== null);
}

/** Possessions : user_cosmetics (RLS auth.uid()). */
async function fetchOwnedIds(): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('user_cosmetics')
    .select('cosmetic_id');
  if (error) throw error;
  return (data ?? []).map((row) => row.cosmetic_id);
}

/** Carte de prévisualisation : copie avec le slot du cosmétique rempli. */
function withCosmetic(card: CardDto, cosmetic: CosmeticDto): CardDto {
  return {
    ...card,
    frame: cosmetic.type === 'frame' ? cosmetic : card.frame,
    holo: cosmetic.type === 'holo' ? cosmetic : card.holo,
    dye: cosmetic.type === 'dye' ? cosmetic : card.dye,
  };
}

export function ShopPage() {
  const t = useTranslations('shop');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<CosmeticType>('frame');
  const [previewCosmeticId, setPreviewCosmeticId] = useState<string | null>(null);
  const [previewCardIndex, setPreviewCardIndex] = useState(0);

  const catalogQuery = useQuery({
    queryKey: ['cosmetics', 'catalog'],
    queryFn: fetchCatalog,
  });
  const ownedQuery = useQuery({
    queryKey: ['my-cosmetics'],
    queryFn: fetchOwnedIds,
  });
  const previewCardsQuery = useQuery({
    queryKey: ['collection', 'preview'],
    queryFn: () => getCollection({ limit: 12 }),
  });

  const buyMutation = useMutation({
    // Clé d'idempotence régénérée À CHAQUE clic, dans le handler.
    mutationFn: (cosmeticId: string) =>
      buyCosmetic({
        cosmetic_id: cosmeticId,
        idempotency_key: crypto.randomUUID(),
      }),
    onSuccess: (result) => {
      toast.success(
        t('purchaseSuccess', {
          name: cosmeticName(result.cosmetic, locale),
          balance: result.new_balance,
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ['my-cosmetics'] });
      void queryClient.invalidateQueries({ queryKey: boosterStateQueryKey });
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof ApiError ? tErrors(error.code) : tErrors('INTERNAL_ERROR'),
      );
    },
  });

  if (catalogQuery.isError) throw catalogQuery.error; // SectionBoundary.

  const catalog = catalogQuery.data ?? [];
  const ownedIds = new Set(ownedQuery.data ?? []);
  const previewCosmetic =
    catalog.find((cosmetic) => cosmetic.id === previewCosmeticId) ?? null;
  const previewCards = previewCardsQuery.data?.items ?? [];
  const previewCard = previewCards[previewCardIndex] ?? null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as CosmeticType)}
        className="gap-4"
      >
        <TabsList>
          {SHOP_TABS.map((slot) => (
            <TabsTrigger key={slot} value={slot}>
              {t(`tabs.${slot}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        {SHOP_TABS.map((slot) => (
          <TabsContent key={slot} value={slot} className="flex flex-col gap-4">
            {/* Aperçu en direct (un seul cosmetic sélectionné à la fois,
                quel que soit l'onglet). */}
            {previewCosmetic && previewCosmetic.type === slot ? (
              <section
                aria-label={t('preview.title')}
                className="flex flex-col gap-4 rounded-xl border border-border bg-card/60 p-4 sm:flex-row sm:items-start"
              >
                <div className="mx-auto w-full max-w-[200px] sm:mx-0">
                  {previewCard ? (
                    <GameCard
                      card={withCosmetic(previewCard, previewCosmetic)}
                      variant="detail"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t('preview.noCards')}
                    </p>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      {t('preview.title')}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {t('preview.description')}
                    </p>
                  </div>
                  {previewCards.length > 0 ? (
                    <div
                      role="group"
                      aria-label={t('preview.selectCardLabel')}
                      className="flex flex-wrap gap-2"
                    >
                      {previewCards.map((card, index) => (
                        <PreviewCardThumb
                          key={card.id}
                          imageUrl={card.character.image_url}
                          name={card.character.name_romaji}
                          selected={index === previewCardIndex}
                          onSelect={() => setPreviewCardIndex(index)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {catalogQuery.isPending ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-32 w-full rounded-xl" />
                ))}
              </div>
            ) : (
              <CatalogGrid
                cosmetics={catalog.filter((cosmetic) => cosmetic.type === slot)}
                ownedIds={ownedIds}
                buyingId={buyMutation.isPending ? (buyMutation.variables ?? null) : null}
                previewCosmeticId={previewCosmeticId}
                onPreview={(cosmetic) =>
                  setPreviewCosmeticId((current) =>
                    current === cosmetic.id ? null : cosmetic.id,
                  )
                }
                onBuy={(cosmetic) => buyMutation.mutate(cosmetic.id)}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

interface CatalogGridProps {
  cosmetics: CosmeticDto[];
  ownedIds: Set<string>;
  buyingId: string | null;
  previewCosmeticId: string | null;
  onPreview: (cosmetic: CosmeticDto) => void;
  onBuy: (cosmetic: CosmeticDto) => void;
}

function CatalogGrid({
  cosmetics,
  ownedIds,
  buyingId,
  previewCosmeticId,
  onPreview,
  onBuy,
}: CatalogGridProps) {
  const t = useTranslations('shop');
  const locale = useLocale();

  if (cosmetics.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/60 px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      </div>
    );
  }

  return (
    <SectionBoundary>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cosmetics.map((cosmetic) => (
          <CosmeticTile
            key={cosmetic.id}
            cosmetic={cosmetic}
            locale={locale}
            owned={ownedIds.has(cosmetic.id)}
            buying={buyingId === cosmetic.id}
            previewing={previewCosmeticId === cosmetic.id}
            onPreview={() => onPreview(cosmetic)}
            onBuy={() => onBuy(cosmetic)}
          />
        ))}
      </div>
    </SectionBoundary>
  );
}
