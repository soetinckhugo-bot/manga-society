import { WifiOff } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui/button';

/** Page offline : fallback des navigations en échec (service worker Serwist). */
export default async function OfflinePage({ params }: PageProps<'/[locale]/offline'>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('offline');

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <WifiOff className="size-10 text-muted-foreground" />
      <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t('description')}</p>
      <Button variant="outline" asChild>
        <Link href="/">{t('backHome')}</Link>
      </Button>
    </div>
  );
}
