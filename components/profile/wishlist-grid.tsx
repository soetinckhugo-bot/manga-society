'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';

import { usePublicProfile } from '@/components/profile/use-public-profile';
import { Skeleton } from '@/components/ui/skeleton';
import type { Rarity } from '@/lib/config';

/** Wishlist publique : tuiles sobres (ce ne sont pas des cartes possédées). */
export function WishlistGrid({ username }: { username: string }) {
  const t = useTranslations('profile');
  const query = usePublicProfile(username);

  if (query.isPending) {
    return (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="aspect-[5/7] w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (query.isError) throw query.error; // Capté par SectionBoundary.

  const wishlist = query.data.wishlist;
  if (wishlist.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground">
        {t('wishlist.empty')}
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
      {wishlist.map((character) => (
        <li
          key={character.id}
          className="relative aspect-[5/7] overflow-hidden rounded-xl border border-border bg-card"
        >
          <Image
            src={character.image_url}
            alt={character.name_romaji}
            fill
            sizes="(max-width: 640px) 30vw, 160px"
            className="object-cover object-top opacity-80"
          />
          <span
            aria-hidden
            className="absolute top-1.5 left-1.5 size-2.5 rounded-full ring-2 ring-black/60"
            style={{
              backgroundColor: `var(--rarity-${character.base_rarity as Rarity})`,
            }}
          />
          <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1.5 py-1 backdrop-blur-sm">
            <p className="truncate text-[10px] font-medium text-zinc-100">
              {character.name_romaji}
            </p>
            <p className="truncate text-[9px] text-zinc-400">
              {character.anime_title}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
