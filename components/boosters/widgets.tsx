'use client';

import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Flame,
  Gift,
  LoaderCircle,
  Shield,
  Sparkles,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { GAME_CONFIG } from '@/lib/config';
import { useNowSeconds } from '@/lib/hooks/use-now';
import { claimDailyPack, claimQuests } from '@/lib/query/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { OpenedCardDto } from '@/types/api';

import { formatClock, toastApiError } from './format';
import { useBoosterState } from './use-booster-state';

/**
 * Widgets du panneau boosters — toutes les valeurs viennent du state
 * serveur (polling partagé de la state-bar + invalidations après mutation) ;
 * seuls les décomptes vers minuit sont cosmétiques (useCountdown).
 */

// ---------------------------------------------------------------------------
// Coquilles communes
// ---------------------------------------------------------------------------

function WidgetShell({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function WidgetSkeleton() {
  return (
    <div
      aria-hidden
      className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4"
    >
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

/** Décompte cosmétique (1 tick/s) vers une date ISO serveur, sinon 0. */
function useCountdown(targetIso: string | null): number {
  const target = targetIso ? new Date(targetIso).getTime() : null;
  const nowSeconds = useNowSeconds();

  if (target === null || Number.isNaN(target) || nowSeconds === 0) return 0;
  return Math.max(Math.ceil(target / 1000) - nowSeconds, 0);
}

// ---------------------------------------------------------------------------
// Pity — garanties Légendaire / Mythique
// ---------------------------------------------------------------------------

export function PityWidget() {
  const t = useTranslations('boosters.widgets.pity');
  const query = useBoosterState();
  if (query.isError) throw query.error;
  if (!query.data) return <WidgetSkeleton />;
  const state = query.data;

  return (
    <WidgetShell title={t('title')} icon={Shield}>
      <ul className="flex flex-col gap-2">
        <li className="flex items-center gap-2 text-sm text-foreground">
          <Sparkles className="size-4 shrink-0 text-[color:var(--rarity-legendary)]" />
          {t('legendary', { count: state.pity_legendary_left })}
        </li>
        <li className="flex items-center gap-2 text-sm text-foreground">
          <Star className="size-4 shrink-0 text-[color:var(--rarity-mythic)]" />
          {t('mythic', { count: state.pity_mythic_left })}
        </li>
      </ul>
    </WidgetShell>
  );
}

// ---------------------------------------------------------------------------
// Booster doré — compteur X/10
// ---------------------------------------------------------------------------

export function GoldenWidget() {
  const t = useTranslations('boosters.widgets.golden');
  const query = useBoosterState();
  if (query.isError) throw query.error;
  if (!query.data) return <WidgetSkeleton />;
  const state = query.data;

  return (
    <WidgetShell title={t('title')} icon={Sparkles}>
      <p className="text-sm tabular-nums text-foreground">
        {t('progress', {
          count: state.golden_counter,
          total: state.golden_every,
        })}
      </p>
      <Progress value={state.golden_counter} max={state.golden_every} />
    </WidgetShell>
  );
}

// ---------------------------------------------------------------------------
// Pack du jour
// ---------------------------------------------------------------------------

export function DailyPackWidget({
  onOpened,
}: {
  onOpened: (cards: OpenedCardDto[], isGolden: boolean) => void;
}) {
  const t = useTranslations('boosters.widgets.daily');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const query = useBoosterState();

  const mutation = useMutation({
    mutationFn: claimDailyPack,
    onSuccess: (response) => {
      void queryClient.invalidateQueries();
      // Le contrat n'expose pas is_golden pour le daily : guard défensif.
      const isGolden =
        'is_golden' in response && response.is_golden === true;
      onOpened(response.cards, isGolden);
    },
    onError: (error) => toastApiError((code) => tErrors(code), error),
  });

  const secondsLeft = useCountdown(
    query.data?.daily_pack.next_reset_at ?? null,
  );

  if (query.isError) throw query.error;
  if (!query.data) return <WidgetSkeleton />;

  const { daily_pack } = query.data;
  const themeName = daily_pack.theme
    ? locale === 'fr'
      ? daily_pack.theme.name_fr
      : daily_pack.theme.name_en
    : null;

  return (
    <WidgetShell title={t('title')} icon={Gift}>
      {themeName ? (
        <p className="text-sm font-medium text-foreground">{themeName}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      )}
      {daily_pack.available ? (
        <Button
          size="sm"
          onClick={() =>
            mutation.mutate({ idempotency_key: crypto.randomUUID() })
          }
          disabled={mutation.isPending || !themeName}
        >
          {mutation.isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Gift />
          )}
          {t('claim')}
        </Button>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="outline" disabled>
            {t('claimed')}
          </Button>
          {daily_pack.next_reset_at ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {t('resetIn', { time: formatClock(secondsLeft) })}
            </span>
          ) : null}
        </div>
      )}
    </WidgetShell>
  );
}

// ---------------------------------------------------------------------------
// Quêtes du jour
// ---------------------------------------------------------------------------

export function QuestsWidget() {
  const t = useTranslations('boosters.widgets.quests');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const query = useBoosterState();

  const mutation = useMutation({
    mutationFn: claimQuests,
    onSuccess: (response) => {
      void queryClient.invalidateQueries();
      toast.success(t('success', { count: response.chakra_gained }));
    },
    onError: (error) => toastApiError((code) => tErrors(code), error),
  });

  if (query.isError) throw query.error;
  if (!query.data) {
    return (
      <div
        aria-hidden
        className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4"
      >
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const quests = query.data.quest_widget;
  const claimableIds = quests
    .filter((quest) => quest.completed && !quest.claimed)
    .map((quest) => quest.id);

  return (
    <WidgetShell title={t('title')} icon={Sparkles}>
      {quests.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {quests.map((quest) => (
            <li key={quest.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-foreground">
                  {locale === 'fr' ? quest.name_fr : quest.name_en}
                </span>
                {quest.claimed ? (
                  <Badge variant="muted">{t('claimed')}</Badge>
                ) : (
                  <Badge variant="outline">
                    {t('reward', { count: quest.chakra_reward })}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Progress
                  value={quest.progress}
                  max={quest.goal}
                  className="flex-1"
                />
                <span className="text-xs tabular-nums text-muted-foreground">
                  {quest.progress}/{quest.goal}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {claimableIds.length > 0 ? (
        <Button
          size="sm"
          className="self-start"
          onClick={() =>
            mutation.mutate({
              quest_ids: claimableIds,
              idempotency_key: crypto.randomUUID(),
            })
          }
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : null}
          {t('claim')}
        </Button>
      ) : null}
    </WidgetShell>
  );
}

// ---------------------------------------------------------------------------
// Streak de connexion — affichage indicatif des récompenses J1-J7
// ---------------------------------------------------------------------------

const STREAK_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function StreakWidget() {
  const t = useTranslations('boosters.widgets.streak');
  const query = useBoosterState();
  if (query.isError) throw query.error;
  if (!query.data) return <WidgetSkeleton />;
  const loginStreak = query.data.login_streak;

  return (
    <WidgetShell title={t('title')} icon={Flame}>
      <p className="text-sm tabular-nums text-foreground">
        {t('current', { count: loginStreak })}
      </p>
      <ol className="grid grid-cols-7 gap-1.5">
        {STREAK_DAYS.map((day, index) => {
          const isCosmeticDay = day === GAME_CONFIG.streak.cosmeticRewardDay;
          const reward = GAME_CONFIG.streak.chakraByDay[index];
          const status =
            day < loginStreak ? 'done' : day === loginStreak ? 'current' : 'upcoming';
          return (
            <li
              key={day}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-center',
                status === 'current'
                  ? 'border-primary bg-primary/10'
                  : 'border-border',
                status === 'done' && 'opacity-60',
              )}
            >
              <span className="text-[10px] font-medium text-muted-foreground">
                {t('day', { day })}
              </span>
              <span className="text-[10px] tabular-nums text-foreground">
                {isCosmeticDay
                  ? t('cosmeticReward')
                  : t('chakraReward', { count: reward })}
              </span>
            </li>
          );
        })}
      </ol>
    </WidgetShell>
  );
}
