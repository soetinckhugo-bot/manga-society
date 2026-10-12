import { Fingerprint, Layers, Sparkles, type LucideIcon } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui/button';

/**
 * Landing publique : héro dark "Kyara clean" (glassmorphism mesuré) +
 * explication de la double rareté (rareté personnage × print Karuta).
 */

const STEP_ICONS: Record<string, LucideIcon> = {
  '1': Layers,
  '2': Fingerprint,
  '3': Sparkles,
};

const STEP_NUMBERS = ['1', '2', '3'] as const;

export default async function LandingPage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('landing');

  return (
    <div className="flex flex-1 flex-col">
      {/* Héro */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,169,78,0.08),transparent_60%)]"
        />
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 py-20 text-center sm:py-28">
          <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            {t('heroTitle')}
          </h1>
          <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
            {t('heroSubtitle')}
          </p>
          <Button size="lg" asChild className="mt-2">
            <Link href="/login">{t('ctaLogin')}</Link>
          </Button>
        </div>
      </section>

      {/* Les 3 étapes de la double rareté */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-20">
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEP_NUMBERS.map((step) => {
            const Icon = STEP_ICONS[step] ?? Sparkles;
            return (
              <li
                key={step}
                className="rounded-xl border border-border bg-card/60 p-6 backdrop-blur-sm"
              >
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold text-primary">
                    {step}
                  </span>
                  <Icon className="size-5 text-muted-foreground" />
                </div>
                <h2 className="mb-2 text-base font-semibold text-foreground">
                  {t(`steps.${step}.title`)}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`steps.${step}.description`)}
                </p>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
