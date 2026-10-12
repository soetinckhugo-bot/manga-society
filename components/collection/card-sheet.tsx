'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { cosmeticFromRow, cosmeticName } from '@/components/cosmetic-dto';
import { useFormatDateTime } from '@/components/date-format';
import { GameCard } from '@/components/game-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { burnValueFor } from '@/lib/config';
import {
  ApiError,
  applyCosmetic,
  boosterStateQueryKey,
  burnCard,
  getCard,
  getWishlist,
  rerollCosmetic,
  toggleWishlist,
} from '@/lib/query/api';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { CardDto, CosmeticDto, CosmeticType } from '@/types/api';

const COSMETIC_SLOTS = ['frame', 'holo', 'dye'] as const satisfies readonly CosmeticType[];

/** Cosmétiques possédés (user_cosmetics → cosmetics, RLS auth.uid()). */
async function fetchMyCosmetics(): Promise<CosmeticDto[]> {
  const supabase = createClient();
  const { data: owned, error: ownedError } = await supabase
    .from('user_cosmetics')
    .select('cosmetic_id');
  if (ownedError) throw ownedError;
  const ids = (owned ?? []).map((row) => row.cosmetic_id);
  if (ids.length === 0) return [];
  const { data: rows, error } = await supabase
    .from('cosmetics')
    .select('*')
    .in('id', ids);
  if (error) throw error;
  return (rows ?? [])
    .map(cosmeticFromRow)
    .filter((cosmetic): cosmetic is CosmeticDto => cosmetic !== null);
}

interface CardSheetProps {
  card: CardDto | null;
  onClose: () => void;
  /** La carte avec ses slots cosmétiques mis à jour (apply/reroll). */
  onCardUpdated: (card: CardDto) => void;
}

export function CardSheet({ card, onClose, onCardUpdated }: CardSheetProps) {
  return (
    <Dialog
      open={card !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {card ? (
        <CardSheetContent
          card={card}
          onClose={onClose}
          onCardUpdated={onCardUpdated}
        />
      ) : null}
    </Dialog>
  );
}

interface CardSheetContentProps {
  card: CardDto;
  onClose: () => void;
  onCardUpdated: (card: CardDto) => void;
}

function CardSheetContent({
  card,
  onClose,
  onCardUpdated,
}: CardSheetContentProps) {
  const t = useTranslations('collection');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const formatDateTime = useFormatDateTime();
  const queryClient = useQueryClient();

  // Étape de confirmation du burn (la valeur affichée est une preview
  // indicative ; le montant réel vient de la réponse serveur).
  const [confirmingBurn, setConfirmingBurn] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['card', card.id],
    queryFn: () => getCard(card.id),
  });
  const wishlistQuery = useQuery({
    queryKey: ['wishlist'],
    queryFn: getWishlist,
  });
  const myCosmeticsQuery = useQuery({
    queryKey: ['my-cosmetics'],
    queryFn: fetchMyCosmetics,
  });

  const showError = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? tErrors(error.code) : tErrors('INTERNAL_ERROR'),
    );
  };

  const burnMutation = useMutation({
    mutationFn: () =>
      burnCard({ card_id: card.id, idempotency_key: crypto.randomUUID() }),
    onSuccess: (result) => {
      toast.success(t('card.burn.success', { count: result.chakra_gained }));
      void queryClient.invalidateQueries({ queryKey: ['collection'] });
      void queryClient.invalidateQueries({ queryKey: ['album'] });
      void queryClient.invalidateQueries({ queryKey: boosterStateQueryKey });
      onClose();
    },
    onError: showError,
  });

  const applyMutation = useMutation({
    mutationFn: (cosmeticId: string) =>
      applyCosmetic(card.id, {
        cosmetic_id: cosmeticId,
        idempotency_key: crypto.randomUUID(),
      }),
    onSuccess: (result) => {
      const applied = result.card.frame ?? result.card.holo ?? result.card.dye;
      toast.success(
        t('card.cosmetics.applied', {
          name: applied ? cosmeticName(applied, locale) : '',
        }),
      );
      onCardUpdated(result.card);
      void queryClient.invalidateQueries({ queryKey: ['collection'] });
    },
    onError: showError,
  });

  const rerollMutation = useMutation({
    mutationFn: (slot: CosmeticType) =>
      rerollCosmetic(card.id, {
        slot,
        idempotency_key: crypto.randomUUID(),
      }),
    onSuccess: (result) => {
      toast.success(
        t('card.cosmetics.rerolled', {
          slot: t(`card.cosmetics.slot.${result.new_cosmetic.type}`),
          name: cosmeticName(result.new_cosmetic, locale),
        }),
      );
      onCardUpdated(result.card);
      void queryClient.invalidateQueries({ queryKey: ['collection'] });
      void queryClient.invalidateQueries({ queryKey: boosterStateQueryKey });
    },
    onError: showError,
  });

  const wishlistMutation = useMutation({
    mutationFn: () => toggleWishlist({ character_id: card.character.id }),
    onSuccess: (result) => {
      const name = card.character.name_romaji;
      toast.success(
        result.added
          ? t('card.wishlist.added', {
              name,
              used: result.slots_used,
              max: result.slots_max,
            })
          : t('card.wishlist.removed', {
              name,
              used: result.slots_used,
              max: result.slots_max,
            }),
      );
      void queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      void queryClient.invalidateQueries({ queryKey: ['collection'] });
    },
    onError: showError,
  });

  const ownedBySlot = useMemo(() => {
    const grouped: Record<CosmeticType, CosmeticDto[]> = {
      frame: [],
      holo: [],
      dye: [],
    };
    for (const cosmetic of myCosmeticsQuery.data ?? []) {
      grouped[cosmetic.type].push(cosmetic);
    }
    return grouped;
  }, [myCosmeticsQuery.data]);

  const wishlisted = wishlistQuery.data?.items.some(
    (item) => item.id === card.character.id,
  );
  const wishlistSlots = wishlistQuery.data
    ? {
        used: wishlistQuery.data.slots_used,
        max: wishlistQuery.data.slots_max,
      }
    : null;

  const burnPreview = burnValueFor(
    card.character.base_rarity,
    card.character.wishlist_count,
  );

  return (
    <DialogContent
      closeLabel={tCommon('close')}
      className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
    >
      <DialogHeader>
        <DialogTitle>{card.character.name_romaji}</DialogTitle>
        <DialogDescription>{card.character.anime_title}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-6 sm:grid-cols-[minmax(0,220px),1fr]">
        <GameCard card={card} variant="detail" />

        <div className="flex flex-col gap-4">
          {/* Verso : infos de possession */}
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{t('card.sourceLabel')}</dt>
              <dd>{t(`card.source.${card.source}`)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{t('card.obtainedLabel')}</dt>
              <dd>{formatDateTime(card.obtained_at)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">
                <span aria-hidden>#</span>
                {'\u00A0'}
                {card.print_number}
              </dt>
              <dd>
                {detailQuery.isPending ? (
                  <Skeleton className="h-4 w-28" />
                ) : detailQuery.isError ? null : (
                  t('card.owners', { count: detailQuery.data.owners_count })
                )}
              </dd>
            </div>
          </dl>

          {/* Wishlist */}
          <Button
            variant={wishlisted ? 'secondary' : 'outline'}
            disabled={wishlistMutation.isPending}
            onClick={() => wishlistMutation.mutate()}
          >
            {wishlisted ? t('card.wishlist.remove') : t('card.wishlist.add')}
            {wishlistSlots ? (
              <Badge variant="muted">
                {wishlistSlots.used}/{wishlistSlots.max}
              </Badge>
            ) : null}
          </Button>

          {/* Cosmétiques : un bloc par slot, apply = possédé → carte,
              reroll = nouveau cosmétique du même type (serveur). */}
          <section aria-label={t('card.cosmetics.title')}>
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              {t('card.cosmetics.title')}
            </h3>
            <div className="flex flex-col gap-3">
              {COSMETIC_SLOTS.map((slot) => {
                const current = card[slot];
                const owned = ownedBySlot[slot];
                return (
                  <div
                    key={slot}
                    className="rounded-lg border border-border bg-muted/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-muted-foreground">
                        {t(`card.cosmetics.slot.${slot}`)}
                      </p>
                      {current ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-foreground">
                            {t('card.cosmetics.current', {
                              name: cosmeticName(current, locale),
                            })}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={rerollMutation.isPending}
                            onClick={() => rerollMutation.mutate(slot)}
                          >
                            {t('card.cosmetics.reroll')}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t('card.cosmetics.none')}
                        </span>
                      )}
                    </div>
                    {owned.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {owned.map((cosmetic) => (
                          <Button
                            key={cosmetic.id}
                            variant="outline"
                            size="sm"
                            disabled={
                              applyMutation.isPending ||
                              current?.id === cosmetic.id
                            }
                            onClick={() => applyMutation.mutate(cosmetic.id)}
                          >
                            {cosmeticName(cosmetic, locale)}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t('card.cosmetics.emptySlot')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Burn : confirmation en deux étapes dans la fiche (Dialog).
              Preview indicative uniquement — le serveur décide du montant. */}
          <section aria-label={t('card.burn.button')}>
            {confirmingBurn ? (
              <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {t('card.burn.confirmTitle')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('card.burn.confirmDescription')}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('card.burn.indicative')}
                  </span>
                  <Badge variant="secondary">
                    {t('card.burn.chakraPreview', { count: burnPreview })}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={burnMutation.isPending}
                    onClick={() => burnMutation.mutate()}
                  >
                    {t('card.burn.confirm')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={burnMutation.isPending}
                    onClick={() => setConfirmingBurn(false)}
                  >
                    {t('card.burn.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className={cn('border-destructive/50 text-red-400 hover:bg-destructive/10 hover:text-red-300')}
                onClick={() => setConfirmingBurn(true)}
              >
                {t('card.burn.button')}
              </Button>
            )}
          </section>
        </div>
      </div>
    </DialogContent>
  );
}
