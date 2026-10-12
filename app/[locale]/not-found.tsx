import { getTranslations } from 'next-intl/server';

import { Link } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui/button';

/**
 * 404 traduite (fr/en). next-intl retombe sur le defaultLocale côté
 * request.ts quand la 404 est rendue hors d'un segment localisé.
 */
export default async function NotFound() {
  const t = await getTranslations('errors.notFound');

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p className="text-6xl font-bold text-primary">404</p>
      <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {t('description')}
      </p>
      <Button variant="outline" asChild>
        <Link href="/">{t('backHome')}</Link>
      </Button>
    </div>
  );
}
