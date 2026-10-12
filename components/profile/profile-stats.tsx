'use client';

import { Flame, type LucideIcon } from 'lucide-react';

import { useFormatDateTime } from '@/components/date-format';
import { usePublicProfile } from '@/components/profile/use-public-profile';
import { GameCard } from '@/components/game-card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { RARITY_CODE, type Rarity } from '@/lib/config';
import { cn } from '@/lib/utils';
import type { CardDto } from '@/types/api';
import { useTranslations } from 'next-intl';

const RARITY_TEXT: Record<Rarity, string> = {
  common: 'text-[color:var(--rarity-common)]',
  uncommon: 'text-[color:var(--rarity-uncommon)]',
  rare: 'text-[color:var(--rarity-rare)]',
  epic: 'text-[color:var(--rarity-epic)]',
  legendary: 'text-[color:var(--rarity-legendary)]',
  mythic: 'text-[color:var(--rarity-mythic)]',
};

/** Stats du profil : compteurs, complétion, meilleur print, rareté, streak. */
export function ProfileStats({ username }: { username: string }) {
  const t = useTranslations('profile');
  const formatDateTime = useFormatDateTime();
  const query = usePublicProfile(username);

  if (query.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (query.isError) throw query.error; // Capté par SectionBoundary.

  const profile = query.data;

  // Carte de PRÉSENTATION synthétique (le meilleur print n'expose pas une
  // carte complète) — jamais passée à une mutation.
  const bestPrintCard: CardDto | null = profile.best_print
    ? {
        id: `best-print-${profile.best_print.character.id}`,
        character: profile.best_print.character,
        print_number: profile.best_print.print_number,
        first_owner: profile.best_print.print_number === 1,
        frame: null,
        holo: null,
        dye: null,
        source: 'booster',
        obtained_at: '',
      }
    : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {t('memberSince', { date: formatDateTime(profile.created_at) })}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('stats.cardsObtained')} value={profile.cards_obtained_count} />
        <StatCard
          label={t('stats.uniqueCharacters')}
          value={profile.unique_characters}
        />
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-4">
          <p className="text-xs text-muted-foreground">
            {t('stats.completion')}
          </p>
          <p className="text-2xl font-bold text-foreground">
            {profile.completion_percent}%
          </p>
          <Progress value={profile.completion_percent} max={100} />
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-4">
          <p className="text-xs text-muted-foreground">{t('stats.streak')}</p>
          <p className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Flame className="size-5 text-[color:var(--primary)]" aria-hidden />
            {t('stats.streakDays', { days: profile.login_streak })}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Meilleur print (prestige Karuta) */}
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card/60 p-4">
          {bestPrintCard ? (
            <>
              <div className="w-24 shrink-0">
                <GameCard card={bestPrintCard} variant="grid" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">
                  {t('stats.bestPrint')}
                </p>
                <p className="font-mono text-xl font-bold text-foreground">
                  #{profile.best_print?.print_number}
                </p>
                <p className="text-xs text-muted-foreground">
                  {profile.best_print?.character.name_romaji}
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('stats.noCards')}</p>
          )}
        </div>

        {/* Meilleure rareté possédée */}
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card/60 p-4">
          <p className="text-xs text-muted-foreground">
            {t('stats.bestRarity')}
          </p>
          {profile.best_rarity ? (
            <Badge variant="outline" className="gap-2">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: `var(--rarity-${profile.best_rarity})` }}
              />
              <span
                className={cn(
                  'font-mono text-sm font-bold',
                  RARITY_TEXT[profile.best_rarity],
                )}
              >
                {RARITY_CODE[profile.best_rarity]}
              </span>
            </Badge>
          ) : (
            <p className="text-sm text-muted-foreground">{t('stats.noCards')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="flex items-center gap-2 text-2xl font-bold text-foreground">
        {Icon ? <Icon className="size-5 text-[color:var(--primary)]" aria-hidden /> : null}
        {value}
      </p>
    </div>
  );
}
