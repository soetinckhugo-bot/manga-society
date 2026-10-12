import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ShopPage } from '@/components/shop/shop-page';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/shop'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'shop' });
  return { title: t('meta.title') };
}

export default async function Page({ params }: PageProps<'/[locale]/shop'>) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Le catalogue (cosmetics, lecture publique) est lu côté client pour
  // bénéficier du cache React Query après les mutations d'achat.
  return <ShopPage />;
}
