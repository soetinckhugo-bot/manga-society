import { getTranslations, setRequestLocale } from 'next-intl/server';

interface LegalPageProps {
  pageKey: 'mentions' | 'cgu' | 'privacy';
  params: Promise<{ locale: string }>;
}

/**
 * Gabarit partagé des pages légales (contenu 100 % traduit, rendu statique).
 * Utilisé par les pages sous `app/[locale]/(legal)`.
 */
export async function LegalPage({ pageKey, params }: LegalPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('legal');
  const title = t(`${pageKey}.title`);
  const paragraphs = t.raw(`${pageKey}.paragraphs`) as string[];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold tracking-tight text-foreground">
        {title}
      </h1>
      <div className="space-y-4">
        {paragraphs.map((paragraph, index) => (
          <p
            key={index}
            className="text-sm leading-relaxed text-muted-foreground sm:text-base"
          >
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}
