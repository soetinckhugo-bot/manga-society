'use client';

import { Component, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

/**
 * section-boundary.tsx — Error boundary réutilisable par section.
 *
 * Une section cassée (throw pendant le rendu) affiche un fallback traduit
 * avec un bouton "Réessayer" au lieu de faire tomber toute la page. Le retry
 * remonte la sous-arbre (les requêtes React Query se relancent au remount).
 */

interface BoundaryInnerProps {
  children: ReactNode;
  title: string;
  description: string;
  retryLabel: string;
  onRetry: () => void;
}

interface BoundaryInnerState {
  error: Error | null;
}

class BoundaryInner extends Component<BoundaryInnerProps, BoundaryInnerState> {
  state: BoundaryInnerState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryInnerState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-10 text-center"
        >
          <p className="text-sm font-medium text-foreground">{this.props.title}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {this.props.description}
          </p>
          <Button variant="outline" size="sm" onClick={this.props.onRetry}>
            {this.props.retryLabel}
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SectionBoundary({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  // resetKey : remonter la sous-arbre au retry force le refetch des queries.
  const [resetKey, setResetKey] = useState(0);

  return (
    <BoundaryInner
      key={resetKey}
      title={t('error')}
      description={t('emptyGenericDescription')}
      retryLabel={t('retry')}
      onRetry={() => setResetKey((key) => key + 1)}
    >
      {children}
    </BoundaryInner>
  );
}
