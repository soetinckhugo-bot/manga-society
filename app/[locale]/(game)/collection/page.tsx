import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { CollectionPage } from '@/components/collection/collection-page';
import { createPublicClient } from '@/lib/supabase/server';
import type { ThemeDto } from '@/types/api';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/collection'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'collection' });
  return { title: t('meta.title') };
}

/** Thèmes de boosters (lecture publique), prerendus au build. */
async function getThemes(): Promise<ThemeDto[]> {
  'use cache';

  const supabase = createPublicClient();
  const { data } = await supabase.from('themes').select('*').order('sort_order');
  return (data ?? []) as ThemeDto[];
}

export default async function Page({
  params,
}: PageProps<'/[locale]/collection'>) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Thèmes publics (lecture publique RLS) pour le filtre de la grille,
  // prerendus au build (`"use cache"` : requête prerendable sous
  // cacheComponents ; client SANS cookies, ces données sont publiques).
  const themes = await getThemes();

  return <CollectionPage themes={themes} />;
}
