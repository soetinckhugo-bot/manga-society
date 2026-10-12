'use client';

import { useTranslations } from 'next-intl';
import { SearchX } from 'lucide-react';

import { SectionBoundary } from '@/components/collection/section-boundary';
import { ProfileStats } from '@/components/profile/profile-stats';
import { ShowcaseSection } from '@/components/profile/showcase-section';
import { usePublicProfile } from '@/components/profile/use-public-profile';
import { WishlistGrid } from '@/components/profile/wishlist-grid';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/query/api';

interface ProfilePageProps {
  username: string;
}

/**
 * Page profil public /u/[username]. Chaque section porte sa propre requête
 * (même queryKey, un seul fetch partagé) et son SectionBoundary : une
 * section cassée n'emporte pas les autres.
 */
export function ProfilePage({ username }: ProfilePageProps) {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const query = usePublicProfile(username);

  if (query.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (query.isError) {
    // 404 métier : profil introuvable (empty state dédié, pas d'erreur brute).
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-20 text-center">
          <SearchX className="size-10 text-muted-foreground" aria-hidden />
          <h1 className="text-xl font-bold text-foreground">
            {t('notFound.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('notFound.description')}
          </p>
        </div>
      );
    }
    // Autre erreur : état traduit avec retry (refetch explicite).
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <p className="text-sm font-medium text-foreground">{t('loadError')}</p>
        <Button
          variant="outline"
          size="sm"
          disabled={query.isRefetching}
          onClick={() => void query.refetch()}
        >
          {tc('retry')}
        </Button>
      </div>
    );
  }

  const profile = query.data;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {profile.username}
        </h1>
      </header>

      <section aria-label={t('stats.cardsObtained')}>
        <SectionBoundary>
          <ProfileStats username={username} />
        </SectionBoundary>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-foreground">
          {t('showcase.title')}
        </h2>
        <SectionBoundary>
          <ShowcaseSection username={username} />
        </SectionBoundary>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-foreground">
          {t('wishlist.title')}
        </h2>
        <SectionBoundary>
          <WishlistGrid username={username} />
        </SectionBoundary>
      </section>
    </div>
  );
}
