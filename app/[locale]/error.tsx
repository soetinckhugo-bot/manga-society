'use client';

import { useTranslations } from 'next-intl';

import { Link } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui/button';

/**
 * error.tsx — page d'erreur traduite (fr/en) pour tout le segment [locale].
 * Client component obligatoire (boundary React : reset() remonte le rendu).
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors.errorPage');

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p className="text-6xl font-bold text-primary">500</p>
      <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {t('description')}
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground/60">{error.digest}</p>
      ) : null}
      <div className="flex gap-3">
        <Button onClick={reset}>{t('retry')}</Button>
        <Button variant="outline" asChild>
          <Link href="/">{t('backHome')}</Link>
        </Button>
      </div>
    </div>
  );
}
