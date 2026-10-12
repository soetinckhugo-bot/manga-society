import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ProfilePage } from '@/components/profile/profile-page';
import { Skeleton } from '@/components/ui/skeleton';

type RouteParams = Promise<{ locale: string; username: string }>;

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/u/[username]'>): Promise<Metadata> {
  const { locale, username } = await params;
  const t = await getTranslations({ locale, namespace: 'profile' });
  return { title: t('meta.title', { username }) };
}

/**
 * Route dynamique (username) : sous `cacheComponents`, l'attente de `params`
 * hors Suspense bloque le prerender. Le shell reste statique ; la résolution
 * des params est streamée dans le boundary.
 */
export default function Page({
  params,
}: PageProps<'/[locale]/u/[username]'>) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileRoute params={params} />
    </Suspense>
  );
}

async function ProfileRoute({ params }: { params: RouteParams }) {
  const { locale, username } = await params;
  setRequestLocale(locale);

  return <ProfilePage username={username} />;
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
