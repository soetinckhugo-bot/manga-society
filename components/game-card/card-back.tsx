import { cn } from '@/lib/utils';

/**
 * PLACEHOLDER AGENT B — l'Agent D remplace par le verso carte définitif
 * (asset `card-back.png`, motif seigaiha sombre). Ne pas étendre.
 *
 * Motif sobre en pur CSS (double dégradé en losange), ratio TCG identique
 * au recto (5/7) pour un flip 1:1.
 */
export function CardBack({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      data-slot="card-back"
      className={cn(
        'aspect-[5/7] w-full rounded-xl border border-border bg-zinc-900',
        'bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.04)_0_8px,transparent_8px_16px),repeating-linear-gradient(-45deg,rgba(255,255,255,0.04)_0_8px,transparent_8px_16px)]',
        className,
      )}
    />
  );
}
