import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { Toaster } from 'sonner';

import { routing } from '@/lib/i18n/routing';
import { Providers } from '@/components/providers';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { InstallBanner } from '@/components/layout/install-banner';
import { ServiceWorkerRegister } from '@/components/layout/service-worker-register';
import '../globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export async function generateMetadata({
  params,
}: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;

  return {
    title: {
      default: 'Manga Society',
      template: '%s | Manga Society',
    },
    description:
      'Collectionnez, échangez et brûlez des cartes de personnages d\u2019anime — prints Karuta, pity, boosters dorés et cosmétiques.',
    manifest: '/manifest.webmanifest',
    icons: {
      icon: '/icons/icon-192.png',
      apple: '/icons/icon-192.png',
    },
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `/${l}`]),
      ),
    },
  };
}

// themeColor = fond du design system dark premium (#0a0a0f), cohérent avec
// le manifest PWA (Next exige themeColor dans `viewport`, pas dans metadata).
export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  width: 'device-width',
  initialScale: 1,
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Rendu statique par locale : toutes les pages héritent de ce segment.
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col bg-background text-foreground">
        <ServiceWorkerRegister />
        <Providers locale={locale} messages={messages}>
          <Header />
          <InstallBanner />
          <main className="flex flex-1 flex-col">{children}</main>
          <Footer />
          <Toaster richColors position="top-center" theme="dark" />
        </Providers>
      </body>
    </html>
  );
}
