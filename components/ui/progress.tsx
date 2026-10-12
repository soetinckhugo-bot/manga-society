import * as React from 'react';

import { cn } from '@/lib/utils';

interface ProgressProps extends React.ComponentProps<'div'> {
  /** Valeur courante (0 à max). */
  value?: number;
  /** Valeur maximale. */
  max?: number;
}

/**
 * Barre de progression simple. Usage AFFICHAGE uniquement — aucune logique
 * métier (les seuils de jeu vivent dans lib/config.ts, côté serveur).
 */
function Progress({
  className,
  value = 0,
  max = 100,
  ...props
}: ProgressProps) {
  const clamped = Math.min(Math.max(value, 0), max);
  const percent = max > 0 ? (clamped / max) * 100 : 0;

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={clamped}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export { Progress };
