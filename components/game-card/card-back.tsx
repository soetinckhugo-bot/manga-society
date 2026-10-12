import Image from 'next/image';

import { cn } from '@/lib/utils';

/**
 * components/game-card/card-back — VERSO CARTE DÉFINITIF (Agent D).
 *
 * Asset local `public/card-back.png` (seigaiha sombre + médaillon doré,
 * ratio 2.5:3.5 → rendu 5/7 identique au recto pour un flip 1:1).
 * Préchargé dès l'écran pack par la séquence d'ouverture.
 */
export function CardBack({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      aria-hidden
      data-slot="card-back"
      className={cn('relative aspect-[5/7] w-full overflow-hidden rounded-xl', className)}
    >
      <Image
        src="/card-back.png"
        alt=""
        fill
        priority={priority}
        sizes="(max-width: 640px) 70vw, 320px"
        className="object-cover"
      />
    </div>
  );
}
