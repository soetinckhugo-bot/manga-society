import * as React from 'react';

import { cn } from '@/lib/utils';

/** Placeholder de chargement (pulse sobre, thème dark). */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
