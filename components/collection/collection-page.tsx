'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { AlbumView } from '@/components/collection/album-view';
import { CardSheet } from '@/components/collection/card-sheet';
import {
  CollectionFilters,
  type CollectionFiltersValue,
} from '@/components/collection/collection-filters';
import { SectionBoundary } from '@/components/collection/section-boundary';
import { GameCard } from '@/components/game-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCollection } from '@/lib/query/api';
import type { CardDto, ThemeDto } from '@/types/api';

/** Taille de page de la grille (présentation pure, pas une constante de jeu). */
const GRID_PAGE_SIZE = 24;

interface CollectionPageProps {
  /** Thèmes publics, chargés côté serveur (lecture publique RLS). */
  themes: ThemeDto[];
}

export function CollectionPage({ themes }: CollectionPageProps) {
  const t = useTranslations('collection');
  const [tab, setTab] = useState('grid');

  const [filters, setFilters] = useState<CollectionFiltersValue>({
    theme: '',
    rarity: null,
    search: '',
    sort: 'recent',
  });
  // Recherche avec debounce 300 ms : la queryKey ne change qu'après la pause.
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timeout = setTimeout(() => {
      setFilters((current) =>
        current.search === searchInput ? current : { ...current, search: searchInput },
      );
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const [selectedCard, setSelectedCard] = useState<CardDto | null>(null);

  const gridQuery = useInfiniteQuery({
    // La queryKey porte les filtres : tout changement reset la pagination.
    queryKey: [
      'collection',
      'grid',
      filters.theme,
      filters.rarity,
      filters.search,
      filters.sort,
    ],
    queryFn: ({ pageParam }) =>
      getCollection({
        cursor: pageParam ?? undefined,
        limit: GRID_PAGE_SIZE,
        theme: filters.theme || undefined,
        rarity: filters.rarity ?? undefined,
        search: filters.search || undefined,
        sort: filters.sort,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  });

  const cards = useMemo(
    () => gridQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [gridQuery.data],
  );
  const totalLoaded = cards.length;
  const isFirstLoad = gridQuery.isPending;
  const hasSearch = Boolean(
    filters.search || filters.theme || filters.rarity,
  );

  // Chargement automatique de la page suivante au scroll (sentinelle).
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = gridQuery;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void fetchNextPage();
        }
      },
      { rootMargin: '600px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage]);

  const updateSelectedCard = (updated: CardDto) => {
    setSelectedCard(updated);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6">
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="grid">{t('tabs.grid')}</TabsTrigger>
            <TabsTrigger value="album">{t('tabs.album')}</TabsTrigger>
          </TabsList>
          {!isFirstLoad && tab === 'grid' ? (
            <p className="text-xs text-muted-foreground">
              {t('grid.cardsCount', { count: totalLoaded })}
            </p>
          ) : null}
        </div>

        <TabsContent value="grid" className="flex flex-col gap-4">
          <CollectionFilters
            themes={themes}
            value={filters}
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            onChange={setFilters}
          />

          <SectionBoundary>
            {isFirstLoad ? (
              <GridSkeleton />
            ) : gridQuery.isError ? (
              // Levé pendant le rendu pour être capté par SectionBoundary.
              (() => {
                throw gridQuery.error;
              })()
            ) : cards.length === 0 ? (
              <div className="rounded-xl border border-border bg-card/60 px-4 py-16 text-center">
                <p className="text-sm font-medium text-foreground">
                  {hasSearch ? t('grid.emptySearch') : t('grid.empty')}
                </p>
                {!hasSearch ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('grid.emptyDescription')}
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {cards.map((card) => (
                    <div
                      key={card.id}
                      role="button"
                      tabIndex={0}
                      aria-label={card.character.name_romaji}
                      onClick={() => setSelectedCard(card)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedCard(card);
                        }
                      }}
                      // Virtualisation pragmatique zero-dep : au-delà de
                      // ~500 cartes, content-visibility: auto saute le
                      // rendu/layout des cellules hors-écran et
                      // contain-intrinsic-size réserve leur emplacement —
                      // pas de librairie de virtualisation.
                      style={{
                        contentVisibility: 'auto',
                        containIntrinsicSize: '224px 314px',
                      }}
                      className="cursor-pointer rounded-xl transition-transform duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:hover:-translate-y-0.5"
                    >
                      <GameCard card={card} variant="grid" />
                    </div>
                  ))}
                </div>

                <div ref={sentinelRef} aria-hidden className="h-px" />
                {hasNextPage ? (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      disabled={isFetchingNextPage}
                      onClick={() => void fetchNextPage()}
                    >
                      {t('grid.loadMore')}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </SectionBoundary>
        </TabsContent>

        <TabsContent value="album">
          <SectionBoundary>
            <AlbumView />
          </SectionBoundary>
        </TabsContent>
      </Tabs>

      <CardSheet
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        onCardUpdated={updateSelectedCard}
      />
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 12 }, (_, index) => (
        <Skeleton key={index} className="aspect-[5/7] w-full rounded-xl" />
      ))}
    </div>
  );
}
