'use client';

import { useTranslations } from 'next-intl';

import { usePublicProfile } from '@/components/profile/use-public-profile';
import { GameCard } from '@/components/game-card';
import { Skeleton } from '@/components/ui/skeleton';

/** Vitrine publique : jusqu'à 5 cartes mises en avant (variant showcase). */
export function ShowcaseSection({ username }: { username: string }) {
  const t = useTranslations('profile');
  const query = usePublicProfile(username);

  if (query.isPending) {
    return (
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="aspect-[5/7] w-32 rounded-xl" />
        ))}
      </div>
    );
  }
  if (query.isError) throw query.error; // Capté par SectionBoundary.

  const showcase = query.data.showcase;
  if (showcase.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground">
        {t('showcase.empty')}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
      {showcase.map((card) => (
        <GameCard key={card.id} card={card} variant="showcase" />
      ))}
    </div>
  );
}
