import { GameCard } from '@/components/game-card';
import { Progress } from '@/components/ui/progress';
import { useTranslations } from 'next-intl';

import type { AlbumEntryDto, AlbumGroupDto, CardDto } from '@/types/api';

/**
 * album-group.tsx — Groupe d'album par anime : barre de complétion,
 * persos possédés en GameCard mini (meilleur print mis en avant) et
 * manquants en silhouette numérotée (index dans le groupe).
 */

function albumCard(entry: AlbumEntryDto): CardDto {
  // Carte de PRÉSENTATION synthétique : l'album n'expose pas d'id de carte
  // (seulement le meilleur print), on fabrique un CardDto valide pour
  // GameCard — jamais envoyé à une mutation.
  return {
    id: `album-${entry.character.id}`,
    character: entry.character,
    print_number: entry.best_print_number ?? 1,
    first_owner: entry.best_print_number === 1,
    frame: null,
    holo: null,
    dye: null,
    source: 'booster',
    obtained_at: '',
  };
}

export function AlbumGroup({ group }: { group: AlbumGroupDto }) {
  const t = useTranslations('collection');

  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <header className="mb-3 flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="truncate text-base font-semibold text-foreground">
            {group.anime_title}
          </h2>
          <p className="shrink-0 text-xs text-muted-foreground">
            {t('album.summary', { owned: group.owned, total: group.total })}
          </p>
        </div>
        <Progress value={group.owned} max={group.total} aria-label={group.anime_title} />
      </header>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {group.entries.map((entry, index) =>
          entry.owned ? (
            <div
              key={entry.character.id}
              className="rounded-xl ring-1 ring-[color:var(--print-gold)]/40"
              title={entry.character.name_romaji}
            >
              <GameCard card={albumCard(entry)} variant="grid" />
            </div>
          ) : (
            <div
              key={entry.character.id}
              className="relative flex aspect-[5/7] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-border bg-zinc-900/60 px-1 text-center"
            >
              <span
                aria-hidden
                className="text-2xl font-bold text-zinc-700"
              >
                {entry.character.name_romaji.charAt(0).toUpperCase()}
              </span>
              <span className="line-clamp-2 text-[10px] leading-tight text-zinc-600">
                {entry.character.name_romaji}
              </span>
              <span className="absolute right-1 bottom-1 font-mono text-[10px] text-zinc-700">
                #{index + 1}
              </span>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
