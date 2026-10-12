'use client';

import { Component, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

/**
 * SectionBoundary — ErrorBoundary par section de la page boosters.
 * Une section qui lève (erreur réseau, réponse hors contrat…) est remplacée
 * par un fallback traduit + bouton retry ; le reste de la page reste vivant.
 */

function BoundaryFallback({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('boosters.boundary');
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card/60 p-6 text-center"
    >
      <p className="text-sm font-medium text-foreground">{t('title')}</p>
      <p className="text-xs text-muted-foreground">{t('description')}</p>
      <Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
        {t('retry')}
      </Button>
    </div>
  );
}

interface SectionBoundaryState {
  error: Error | null;
}

export class SectionBoundary extends Component<
  { children: ReactNode },
  SectionBoundaryState
> {
  state: SectionBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): SectionBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <BoundaryFallback onRetry={() => this.setState({ error: null })} />
      );
    }
    return this.props.children;
  }
}
