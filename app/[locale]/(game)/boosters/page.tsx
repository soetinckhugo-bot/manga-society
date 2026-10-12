import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { BoostersPage } from '@/components/boosters/boosters-page';
import { createPublicClient } from '@/lib/supabase/server';
import type { ThemeDto } from '@/types/api';

/**
 * /[locale]/boosters — LA page de jeu (ouverture de boosters).
 *
 * Shell serveur léger : la liste des thèmes est une lecture publique
 * (RLS) chargée côté serveur et MISE EN CACHE au build (`"use cache"` —
 * requête prerendable sous cacheComponents) ; tout l'interactif (state,
 * pool, mutations) vit dans le composant client.
 */

/** Thèmes de boosters (lecture publique), prerendus au build. */
async function getThemes(): Promise<ThemeDto[]> {
  'use cache';

  const supabase = createPublicClient();
  const { data } = await supabase
    .from('themes')
    .select('*')
    .order('sort_order');

  return (data ?? []) as ThemeDto[];
}

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/boosters'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'boosters' });
  return { title: t('meta.title') };
}

export default async function BoostersRoute({
  params,
}: PageProps<'/[locale]/boosters'>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const themes = await getThemes();

  return <BoostersPage themes={themes} />;
}
