import { getTranslations } from 'next-intl/server';

import { Link } from '@/lib/i18n/navigation';
import { CopyrightYear } from './copyright-year';

/** Footer : liens légaux + copyright. Server Component (textes traduits). */
export async function Footer() {
  const t = await getTranslations('nav');

  const legalLinks = [
    { href: '/mentions-legales' as const, label: t('legal.mentions') },
    { href: '/cgu' as const, label: t('legal.cgu') },
    { href: '/confidentialite' as const, label: t('legal.privacy') },
  ];

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
        <p>
          © <CopyrightYear /> Manga Society
        </p>
        <nav className="flex items-center gap-4">
          {legalLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
