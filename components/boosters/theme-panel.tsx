'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, Gem, LoaderCircle, Star } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { GAME_CONFIG, RARITIES } from '@/lib/config';
import {
  getThemePoolInfo,
  openBooster,
  openPremiumBooster,
} from '@/lib/query/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { OpenedCardDto, ThemeDto } from '@/types/api';

import { toastApiError } from './format';
import { useBoosterState } from './use-booster-state';

/**
 * Panneau du thème sélectionné "façon Kyara" :
 * - barres par rareté (hauteur = part du pool) + total de personnages ;
 * - mise en avant des persos de la wishlist présents dans le pool ;
 * - ouverture gratuite / premium : idempotency_key générée À CHAQUE clic,
 *   aucune UI optimiste, resync par invalidateQueries, succès → onOpened
 *   (monte BoosterOpening côté orchestrateur).
 */

interface ThemePanelProps {
  theme: ThemeDto | null;
  onOpened: (cards: OpenedCardDto[], isGolden: boolean) => void;
}

function poolQueryKey(slug: string) {
  return ['theme-pool', slug] as const;
}

const BAR_CONTAINER_HEIGHT = 'h-28';

export function ThemePanel({ theme, onOpened }: ThemePanelProps) {
  const t = useTranslations('boosters');

  if (!theme) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card/60 p-10">
        <p className="text-sm text-muted-foreground">{t('panel.empty')}</p>
      </div>
    );
  }

  return <ThemePanelContent theme={theme} onOpened={onOpened} />;
}

function ThemePanelContent({
  theme,
  onOpened,
}: {
  theme: ThemeDto;
  onOpened: (cards: OpenedCardDto[], isGolden: boolean) => void;
}) {
  const t = useTranslations('boosters');
  const tRarity = useTranslations('boosters.rarity');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const queryClient = useQueryClient();

  // Même clé que la state-bar : une seule requête pour tout le panneau.
  const stateQuery = useBoosterState();
  const poolQuery = useQuery({
    queryKey: poolQueryKey(theme.slug),
    queryFn: () => getThemePoolInfo(theme.slug),
  });

  const openMutation = useMutation({
    mutationFn: openBooster,
    onSuccess: (response) => {
      void queryClient.invalidateQueries();
      onOpened(response.cards, response.is_golden);
    },
    onError: (error) => toastApiError((code) => tErrors(code), error),
  });

  const premiumMutation = useMutation({
    mutationFn: openPremiumBooster,
    onSuccess: (response) => {
      void queryClient.invalidateQueries();
      onOpened([response.card], response.is_golden);
    },
    onError: (error) => toastApiError((code) => tErrors(code), error),
  });

  if (poolQuery.isError) throw poolQuery.error;

  const name = locale === 'fr' ? theme.name_fr : theme.name_en;
  const pool = poolQuery.data;

  const anyPending = openMutation.isPending || premiumMutation.isPending;

  // Soldes serveur (jamais calculés côté client) ; désactivés tant que le
  // premier fetch n'a pas répondu — le serveur reste l'arbitre final.
  const stockLeft = stateQuery.data?.booster_count;
  const premiumPoints = stateQuery.data?.premium_points;
  const premiumPrice = GAME_CONFIG.premium.boosterPrice;
  const freeDisabled = anyPending || !stateQuery.isSuccess || (stockLeft ?? 0) <= 0;
  const premiumDisabled =
    anyPending ||
    !stateQuery.isSuccess ||
    (premiumPoints ?? 0) < premiumPrice;

  const handleOpen = () => {
    // Clé générée DANS le handler, à chaque tentative (idempotence).
    openMutation.mutate({
      theme_slug: theme.slug,
      idempotency_key: crypto.randomUUID(),
    });
  };

  const handlePremium = () => {
    premiumMutation.mutate({ idempotency_key: crypto.randomUUID() });
  };

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-card/60 p-5 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-semibold text-foreground">{name}</h2>
          {pool ? (
            <p className="text-xs text-muted-foreground">
              {t('panel.characters', { count: pool.total_characters })}
            </p>
          ) : null}
        </div>
        {pool && pool.wishlist_matches > 0 ? (
          <Badge className="border-transparent bg-primary/15 text-primary">
            <Star />
            {t('panel.wishlist', { count: pool.wishlist_matches })}
          </Badge>
        ) : null}
      </div>

      {/* Barres par rareté : hauteur relative à la rareté la plus peuplée. */}
      {!pool ? (
        <div className="flex items-end gap-2" aria-hidden>
          {RARITIES.map((rarity) => (
            <Skeleton
              key={rarity}
              className={`flex-1 ${BAR_CONTAINER_HEIGHT}`}
            />
          ))}
        </div>
      ) : (
        <ul className={`flex items-end gap-2 ${BAR_CONTAINER_HEIGHT}`}>
          {RARITIES.map((rarity) => {
            const count = pool.by_rarity[rarity];
            const max = Math.max(
              ...RARITIES.map((r) => pool.by_rarity[r]),
              1,
            );
            const heightPercent = (count / max) * 100;
            return (
              <li
                key={rarity}
                title={`${tRarity(rarity)} — ${count}`}
                className="flex h-full flex-1 flex-col items-center justify-end gap-1"
              >
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {count}
                </span>
                <div
                  className="w-full rounded-t-sm transition-[height] duration-500 ease-out motion-reduce:transition-none"
                  style={{
                    height: `${heightPercent}%`,
                    backgroundColor: `var(--rarity-${rarity})`,
                    opacity: count === 0 ? 0.2 : 0.85,
                  }}
                />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {tRarity(rarity)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          onClick={handleOpen}
          disabled={freeDisabled}
          aria-label={t('actions.open')}
        >
          {openMutation.isPending ? (
            <>
              <LoaderCircle className="animate-spin" />
              {t('actions.opening')}
            </>
          ) : (
            t('actions.open')
          )}
        </Button>
        {stateQuery.isSuccess && (stockLeft ?? 0) <= 0 ? (
          <p className="text-center text-xs text-muted-foreground">
            {t('actions.noStock')}
          </p>
        ) : null}

        <Button
          size="lg"
          variant="outline"
          onClick={handlePremium}
          disabled={premiumDisabled}
          aria-label={t('actions.premium')}
        >
          {premiumMutation.isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Crown />
          )}
          {t('actions.premium')}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Gem />
          {stateQuery.isSuccess && (premiumPoints ?? 0) < premiumPrice
            ? t('actions.premiumDisabled')
            : t('actions.premiumHint', { price: premiumPrice })}
        </p>
      </div>
    </section>
  );
}
