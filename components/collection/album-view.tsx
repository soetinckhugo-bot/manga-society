'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { AlbumGroup } from '@/components/collection/album-group';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { getAlbum } from '@/lib/query/api';

/** Album : silhouettes groupées par anime (GET /api/collection/album). */
export function AlbumView() {
  const t = useTranslations('collection');
  const query = useQuery({ queryKey: ['album'], queryFn: getAlbum });

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) throw query.error; // Capté par SectionBoundary.

  const { groups, total_characters, owned_characters } = query.data;
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card/60 px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">{t('album.empty')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-card/60 p-4">
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold text-foreground">
            {t('album.summaryTitle')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t('album.summary', {
              owned: owned_characters,
              total: total_characters,
            })}
          </p>
        </div>
        <Progress
          value={owned_characters}
          max={total_characters}
          aria-label={t('album.summaryTitle')}
        />
      </div>

      {groups.map((group) => (
        <AlbumGroup key={group.anime_title} group={group} />
      ))}
    </div>
  );
}
