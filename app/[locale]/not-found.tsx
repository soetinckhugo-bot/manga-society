import { Link } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui/button';

/**
 * 404. Rendu sans préfixe de locale garanti : next-intl retombe sur le
 * defaultLocale côté request.ts.
 */
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p className="text-6xl font-bold text-primary">404</p>
      <Button variant="outline" asChild>
        <Link href="/">Manga Society</Link>
      </Button>
    </div>
  );
}
