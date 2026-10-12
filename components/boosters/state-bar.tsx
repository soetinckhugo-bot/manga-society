'use client';

import { Crown, Flame, Package, Timer } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { GAME_CONFIG } from '@/lib/config';
import { useBoosterTimer } from '@/lib/hooks/use-booster-timer';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

import { formatClock } from './format';
import { useBoosterStatePolling } from './use-booster-state';

/**
 * Barre d'état : stock de boosters "X/10" + recharge, soldes chakra et
 * points premium. Vérité serveur via polling React Query (30 s) ; entre
 * deux polls, useBoosterTimer fournit un décompte mm:ss et une barre de
 * progression PUREMENT COSMÉTIQUES (resync automatique à chaque poll).
 */

export function StateBar() {
  const t = useTranslations('boosters.state');
  const query = useBoosterStatePolling();

  const state = query.data;
  // Décompte cosmétique : tolère l'absence de data pendant le 1er fetch.
  const { secondsLeft, progress } = useBoosterTimer(
    state?.next_recharge_at ?? null,
    state?.recharge_interval_minutes ??
      GAME_CONFIG.booster.recharge.intervalMinutes,
  );

  if (query.isError) throw query.error;

  if (!state) {
    return (
      <div
        aria-hidden
        className="flex items-center gap-4 rounded-xl border border-border bg-card/60 p-4"
      >
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-2 flex-1" />
        <Skeleton className="h-5 w-24" />
      </div>
    );
  }

  const stockFull = state.booster_count >= state.max_stock;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <Package className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {t('stock', {
              count: state.booster_count,
              max: state.max_stock,
            })}
          </span>
          <Progress
            value={state.booster_count}
            max={state.max_stock}
            className="w-28"
          />
        </div>
        {stockFull ? (
          <Badge variant="success">{t('stockFull')}</Badge>
        ) : state.next_recharge_at ? (
          <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
            <Timer className="size-3.5" />
            {t('rechargeIn', { time: formatClock(secondsLeft) })}
          </span>
        ) : null}
      </div>

      {/* Barre de progression cosmétique de la tranche de recharge. */}
      {!stockFull && state.next_recharge_at ? (
        <Progress
          value={progress * 100}
          aria-hidden
          className="sm:max-w-40 sm:flex-1"
        />
      ) : (
        <div className="hidden sm:block sm:flex-1" />
      )}

      <div className="flex items-center gap-4 sm:ml-auto">
        <span className="flex items-center gap-1.5 text-sm tabular-nums text-foreground">
          <Flame className="size-4 text-muted-foreground" />
          {t('chakra', { count: state.chakra })}
        </span>
        <span className="flex items-center gap-1.5 text-sm tabular-nums text-foreground">
          <Crown className="size-4 text-muted-foreground" />
          {t('premiumPoints', { count: state.premium_points })}
        </span>
      </div>
    </div>
  );
}
